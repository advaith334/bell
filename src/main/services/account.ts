import { z } from 'zod'
import { api, describeFailure, NotSignedInError } from './http'
import * as auth from './auth'
import type { Account, AccountState } from '@/shared/types'
import { EMPTY_ACCOUNT_STATE } from '@/shared/types'

/**
 * What the app is allowed to do, cached in memory the same way settings are.
 *
 * The cache is advisory. The server decides — the TTS function checks entitlement
 * on every read and returns 402 if it disagrees — so a stale copy here can only
 * ever cause an optimistic attempt that gets cleanly refused, never an
 * unauthorized synthesis.
 */

const accountSchema = z.object({
  userId: z.string(),
  email: z.string().nullable(),
  entitlement: z.object({
    plan: z.enum(['free', 'pro']),
    status: z.string(),
    isActive: z.boolean(),
    currentPeriodEnd: z.number().nullable(),
    readsRemaining: z.number().nullable(),
    freeReadsUsed: z.number(),
    freeCharsUsed: z.number(),
    monthlyChars: z.number(),
    monthlyCharsIncluded: z.number().nullable(),
    throttled: z.boolean(),
  }),
  limits: z.object({
    freeReadLimit: z.number(),
    freeCharLimit: z.number(),
    maxCharsPerRequest: z.number(),
  }),
})

type Listener = (state: AccountState) => void

const listeners = new Set<Listener>()
let state: AccountState = { ...EMPTY_ACCOUNT_STATE }
let inFlight: Promise<Account | null> | null = null

export function onChange(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function set(next: Partial<AccountState>): void {
  state = { ...state, ...next }
  for (const listener of listeners) listener(state)
}

export function current(): AccountState {
  return state
}

export function init(): void {
  auth.load()
  set({ signedIn: auth.isSignedIn() })

  auth.onChange((authState) => {
    if (authState === 'signed-out') {
      set({ signedIn: false, account: null, error: null })
      return
    }
    set({ signedIn: true })
    void refresh()
  })

  if (auth.isSignedIn()) void refresh()
}

export async function refresh(): Promise<Account | null> {
  if (!auth.isSignedIn()) {
    set({ signedIn: false, account: null })
    return null
  }

  // Several things want a refresh at once on launch (init, window focus, the
  // first read). One request is enough.
  if (inFlight) return inFlight

  set({ loading: true })
  inFlight = api
    .get('me')
    .json()
    .then((body) => {
      const account = accountSchema.parse(body)
      set({ signedIn: true, account, error: null, loading: false })
      return account as Account
    })
    .catch((error: unknown) => {
      const described = describeFailure(error)
      if (described instanceof NotSignedInError) {
        set({ signedIn: false, account: null, loading: false })
        return null
      }
      // Keep whatever we last knew. Showing "0 reads left" because the network
      // blipped would be a lie, and an alarming one.
      set({ error: described.message, loading: false })
      return state.account
    })
    .finally(() => {
      inFlight = null
    })

  return inFlight
}

/**
 * The optimistic local gate, consulted before a read starts so the app can show
 * the paywall without a round trip. Returns null when the read may proceed.
 */
export function blockedReason(): 'needs-auth' | 'needs-upgrade' | null {
  if (!auth.isSignedIn()) return 'needs-auth'

  const entitlement = state.account?.entitlement
  // Unknown entitlement (first launch, or a failed refresh) is allowed through:
  // the server will refuse if it should, and being wrong in this direction costs
  // one rejected request rather than blocking a paying customer.
  if (!entitlement) return null

  if (entitlement.plan === 'pro' && entitlement.isActive) return null
  if (entitlement.readsRemaining !== null && entitlement.readsRemaining <= 0) return 'needs-upgrade'
  return null
}

/** Called after a read so the remaining-reads card is current without a poll. */
export function refreshSoon(): void {
  setTimeout(() => void refresh(), 1_000)
}

export async function checkoutUrl(): Promise<string> {
  const body = await api.post('billing/checkout').json()
  return z.object({ url: z.string().url() }).parse(body).url
}

export async function portalUrl(): Promise<string> {
  const body = await api.post('billing/portal').json()
  return z.object({ url: z.string().url() }).parse(body).url
}

/**
 * Stripe's webhook can lag the redirect by a few seconds, and asking someone who
 * just paid to click again would be a poor first impression. So after Checkout we
 * poll briefly until the entitlement flips.
 */
export async function awaitUpgrade(timeoutMs = 60_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  let delay = 1_000

  while (Date.now() < deadline) {
    const account = await refresh()
    if (account?.entitlement.isActive) return true
    await new Promise((resolve) => setTimeout(resolve, delay))
    delay = Math.min(delay * 1.5, 8_000)
  }
  return false
}
