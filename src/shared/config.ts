/**
 * Where the app talks to. These are baked in at build time from the Terraform
 * outputs (`terraform output -json client_env`), with environment overrides so a
 * developer can point a local build at the dev stack without rebuilding.
 *
 * None of these are secrets. The Cognito client id is public by design — the app
 * is a public OAuth client and PKCE, not a client secret, is what protects the
 * authorization code.
 */

function fromEnv(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback
}

export const BACKEND = {
  /** Control plane: /me, /voices, /billing/*. */
  apiUrl: fromEnv('PILCROW_API_URL', 'https://api.pilcrow.app'),

  /** Audio proxy. A Lambda Function URL, so it is a long amazonaws.com hostname. */
  ttsUrl: fromEnv('PILCROW_TTS_URL', ''),

  /** Cognito user pool issuer; openid-client discovers everything else from it. */
  issuer: fromEnv('PILCROW_COGNITO_ISSUER', ''),
  clientId: fromEnv('PILCROW_COGNITO_CLIENT', ''),

  /** Marketing site, used for the billing return page and support links. */
  webUrl: fromEnv('PILCROW_WEB_URL', 'https://pilcrow.app'),

  /** Where electron-updater looks for latest-mac.yml. */
  updateFeedUrl: fromEnv('PILCROW_UPDATE_FEED', 'https://dl.pilcrow.app/'),
} as const

/** The custom scheme macOS hands back to us after sign-in. */
export const DEEP_LINK_SCHEME = 'pilcrow'
export const REDIRECT_URI = `${DEEP_LINK_SCHEME}://auth/callback`

/**
 * In an unpackaged build macOS registers the Electron binary for the scheme
 * rather than Pilcrow, which makes the custom-scheme round trip unreliable. A
 * loopback listener is the standard alternative for native OAuth clients and is
 * registered as a second callback URL on the Cognito app client.
 */
export const DEV_REDIRECT_PORT = 8788
export const DEV_REDIRECT_URI = `http://localhost:${DEV_REDIRECT_PORT}/auth/callback`

export function isConfigured(): boolean {
  return Boolean(BACKEND.issuer && BACKEND.clientId && BACKEND.ttsUrl)
}
