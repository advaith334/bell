import { app, safeStorage, shell } from 'electron'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import * as oidc from 'openid-client'
import { decodeJwt } from 'jose'
import {
  BACKEND,
  DEV_REDIRECT_PORT,
  DEV_REDIRECT_URI,
  REDIRECT_URI,
} from '@/shared/config'

/**
 * Sign in with Apple and Google, through the Cognito hosted UI.
 *
 * Every part of the OAuth flow that is easy to get subtly wrong — the PKCE
 * challenge, the state check, the code exchange, refresh — is handled by
 * `openid-client`, which is an OpenID-certified implementation. We supply the
 * browser round trip and the token storage; that is all.
 *
 * Two things are deliberate:
 *
 *  - The authorization page opens in the system browser, never in a BrowserWindow.
 *    Apple and Google both prohibit embedded webviews for sign-in, and an
 *    in-app window asking for a Google password is indistinguishable from
 *    phishing even when it is legitimate.
 *
 *  - There is no client secret. Anything shipped inside an .app can be read by
 *    anyone who downloads it, so this is a public client and PKCE is the actual
 *    security boundary.
 */

export interface Tokens {
  accessToken: string
  refreshToken: string
  /** Epoch ms. */
  expiresAt: number
  email?: string
}

export type AuthState = 'signed-out' | 'signed-in'

type Listener = (state: AuthState) => void

const listeners = new Set<Listener>()
let tokens: Tokens | null = null
let configuration: oidc.Configuration | null = null

/** Guards against two concurrent 401s both firing a refresh. */
let refreshInFlight: Promise<Tokens | null> | null = null

/** The in-flight authorization attempt, if any. */
let pending: {
  verifier: string
  state: string
  redirectUri: string
  resolve: (tokens: Tokens) => void
  reject: (error: Error) => void
  server?: http.Server
} | null = null

function tokenPath(): string {
  return path.join(app.getPath('userData'), 'tokens.bin')
}

/**
 * Tokens are encrypted with safeStorage, which is backed by the macOS Keychain —
 * the same treatment the ElevenLabs key used to get. A refresh token is a
 * long-lived credential and has no business sitting in a readable JSON file.
 */
function persist(next: Tokens | null): void {
  tokens = next

  if (!next) {
    fs.rmSync(tokenPath(), { force: true })
    notify()
    return
  }

  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Secure storage is unavailable, so Pilcrow cannot keep you signed in.')
  }

  fs.writeFileSync(tokenPath(), safeStorage.encryptString(JSON.stringify(next)))
  notify()
}

function notify(): void {
  const state = currentState()
  for (const listener of listeners) listener(state)
}

export function onChange(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function load(): void {
  try {
    tokens = JSON.parse(safeStorage.decryptString(fs.readFileSync(tokenPath()))) as Tokens
  } catch {
    // No file, or a keychain the OS will not unlock. Either way: signed out.
    tokens = null
  }
}

export function currentState(): AuthState {
  return tokens ? 'signed-in' : 'signed-out'
}

export function isSignedIn(): boolean {
  return tokens !== null
}

export function email(): string | undefined {
  return tokens?.email
}

async function discover(): Promise<oidc.Configuration> {
  if (configuration) return configuration
  if (!BACKEND.issuer || !BACKEND.clientId) {
    throw new Error('Pilcrow is not configured with a sign-in server.')
  }

  configuration = await oidc.discovery(
    new URL(BACKEND.issuer),
    BACKEND.clientId,
    undefined,
    // A public client authenticates with nothing at the token endpoint; PKCE is
    // what proves the exchange belongs to the request that started it.
    oidc.None(),
  )
  return configuration
}

function toTokens(response: oidc.TokenEndpointResponse, previousRefresh?: string): Tokens {
  const refreshToken = response.refresh_token ?? previousRefresh
  if (!refreshToken) {
    throw new Error('The sign-in server did not return a refresh token.')
  }

  let email: string | undefined
  try {
    const claims = decodeJwt(response.id_token ?? response.access_token)
    if (typeof claims['email'] === 'string') email = claims['email']
  } catch {
    // A missing email is cosmetic — it only shows in Settings.
  }

  return {
    accessToken: response.access_token,
    refreshToken,
    // Cognito issues 60-minute access tokens; a minute of slack means we refresh
    // before a request fails rather than after.
    expiresAt: Date.now() + (response.expires_in ?? 3600) * 1000 - 60_000,
    email,
  }
}

/**
 * A loopback listener, used only in development. In an unpackaged build macOS
 * registers the Electron binary for the `pilcrow://` scheme rather than Pilcrow
 * itself, so the custom-scheme round trip is unreliable there. Loopback
 * redirection is the other blessed option for native OAuth clients (RFC 8252),
 * and the URL is registered on the Cognito app client alongside the deep link.
 */
function startLoopbackServer(): http.Server {
  const server = http.createServer((request, response) => {
    if (!request.url) return
    const url = new URL(request.url, DEV_REDIRECT_URI)
    if (url.pathname !== '/auth/callback') {
      response.writeHead(404).end()
      return
    }

    response.writeHead(200, { 'content-type': 'text/html' })
    response.end('<html><body style="font-family:system-ui;padding:3rem">You can close this tab and return to Pilcrow.</body></html>')
    void handleCallback(url)
  })

  server.listen(DEV_REDIRECT_PORT, '127.0.0.1')
  return server
}

export async function signIn(): Promise<Tokens> {
  cancelPending(new Error('Another sign-in was started.'))

  const config = await discover()
  const verifier = oidc.randomPKCECodeVerifier()
  const challenge = await oidc.calculatePKCECodeChallenge(verifier)
  const state = oidc.randomState()
  const redirectUri = app.isPackaged ? REDIRECT_URI : DEV_REDIRECT_URI

  const url = oidc.buildAuthorizationUrl(config, {
    redirect_uri: redirectUri,
    scope: 'openid email profile',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
  })

  const result = new Promise<Tokens>((resolve, reject) => {
    pending = {
      verifier,
      state,
      redirectUri,
      resolve,
      reject,
      server: app.isPackaged ? undefined : startLoopbackServer(),
    }
  })

  await shell.openExternal(url.href)

  // Someone who opens the browser and then walks away should not leave a dead
  // promise and an open port behind forever.
  const timeout = setTimeout(() => cancelPending(new Error('Sign-in timed out.')), 5 * 60 * 1000)
  return result.finally(() => clearTimeout(timeout))
}

function cancelPending(error: Error): void {
  if (!pending) return
  pending.server?.close()
  pending.reject(error)
  pending = null
}

/**
 * Called with the callback URL, from either the `open-url` deep link (packaged)
 * or the loopback listener (development).
 */
export async function handleCallback(url: URL): Promise<void> {
  if (!pending) return

  const attempt = pending
  pending = null
  attempt.server?.close()

  try {
    const config = await discover()

    // openid-client re-checks `state` itself given expectedState; the check is
    // what stops an attacker's authorization code being swapped into our session.
    const response = await oidc.authorizationCodeGrant(config, url, {
      pkceCodeVerifier: attempt.verifier,
      expectedState: attempt.state,
    })

    const next = toTokens(response)
    persist(next)
    attempt.resolve(next)
  } catch (error) {
    attempt.reject(error instanceof Error ? error : new Error(String(error)))
  }
}

export function signOut(): void {
  cancelPending(new Error('Signed out.'))
  persist(null)
}

/**
 * The only token accessor the rest of the app uses. Refreshes when the access
 * token is close to expiry, and collapses concurrent callers onto one refresh so
 * a five-chunk read does not fire five of them.
 */
export async function getAccessToken(): Promise<string | null> {
  if (!tokens) return null
  if (Date.now() < tokens.expiresAt) return tokens.accessToken

  const refreshed = await (refreshInFlight ??= refresh().finally(() => {
    refreshInFlight = null
  }))
  return refreshed?.accessToken ?? null
}

async function refresh(): Promise<Tokens | null> {
  const previous = tokens
  if (!previous) return null

  try {
    const config = await discover()
    const response = await oidc.refreshTokenGrant(config, previous.refreshToken)
    const next = toTokens(response, previous.refreshToken)
    persist(next)
    return next
  } catch (error) {
    // A refresh token is rejected when it has expired, been revoked, or the user
    // deleted their account. All three mean the same thing to us: sign out and
    // let them sign in again. History and cached audio are untouched.
    console.error('[pilcrow] refresh failed, signing out:', error)
    persist(null)
    return null
  }
}

/** Signs out at the identity provider too, so the next sign-in shows the picker. */
export async function openSignOutPage(): Promise<void> {
  try {
    const config = await discover()
    const url = oidc.buildEndSessionUrl(config, {
      client_id: BACKEND.clientId,
      logout_uri: `${DEEP_LINK_LOGOUT}`,
    })
    await shell.openExternal(url.href)
  } catch {
    // Cognito does not always advertise end_session_endpoint. Not being able to
    // clear the browser session is a minor annoyance, not a failure.
  }
}

const DEEP_LINK_LOGOUT = 'pilcrow://auth/signout'
