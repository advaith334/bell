import { useState } from 'react'
import type { AccountState } from '@/shared/types'

/**
 * The Account block in Settings, standing exactly where the ElevenLabs API key
 * field used to. Everything about billing that is not "show me the state" opens
 * Stripe's own hosted pages — cancellation, card changes and invoices are their
 * problem, not ours.
 */

interface Props {
  account: AccountState
  onMessage: (message: string | null) => void
}

function formatDate(epochMs: number): string {
  return new Date(epochMs).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function AccountSection({ account, onMessage }: Props) {
  const [busy, setBusy] = useState(false)

  const run = async (action: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true)
    onMessage(null)
    const result = await action()
    setBusy(false)
    if (!result.ok) onMessage(result.error ?? 'Something went wrong.')
  }

  if (!account.signedIn) {
    return (
      <section className="field">
        <label>Account</label>
        <p className="field__hint">
          Sign in to read aloud. Pilcrow includes the voice — you do not need an API key.
        </p>
        <button
          className="button button--primary"
          type="button"
          disabled={busy}
          onClick={() => void run(() => window.pilcrow.signIn())}
        >
          Sign in
        </button>
      </section>
    )
  }

  const entitlement = account.account?.entitlement
  const email = account.account?.email

  return (
    <section className="field">
      <label>Account</label>

      <div className="account">
        <div className="account__row">
          <span className="account__label">Signed in as</span>
          <span className="account__value">{email ?? '—'}</span>
        </div>

        <div className="account__row">
          <span className="account__label">Plan</span>
          <span className="account__value">
            {!entitlement ? (
              // A failed refresh must not be rendered as "free" — that would read
              // as a downgrade to someone who is paying.
              account.error ? 'Unavailable offline' : 'Loading…'
            ) : entitlement.plan === 'pro' ? (
              <>
                Pilcrow Pro
                {entitlement.status === 'canceled' && entitlement.currentPeriodEnd
                  ? ` — ends ${formatDate(entitlement.currentPeriodEnd)}`
                  : entitlement.currentPeriodEnd
                    ? ` — renews ${formatDate(entitlement.currentPeriodEnd)}`
                    : ''}
              </>
            ) : (
              `Free — ${entitlement.readsRemaining ?? 0} of ${account.account?.limits.freeReadLimit ?? 20} reads left`
            )}
          </span>
        </div>

        {entitlement?.plan === 'pro' && entitlement.monthlyCharsIncluded ? (
          <div className="account__row">
            <span className="account__label">This month</span>
            <span className="account__value">
              {Math.round(entitlement.monthlyChars / 1000).toLocaleString()}k of{' '}
              {Math.round(entitlement.monthlyCharsIncluded / 1000).toLocaleString()}k characters
              {entitlement.throttled ? ' — reading a little slower past this' : ''}
            </span>
          </div>
        ) : null}
      </div>

      <div className="account__actions">
        {entitlement?.plan === 'pro' ? (
          <button
            className="button"
            type="button"
            disabled={busy}
            onClick={() => void run(() => window.pilcrow.openBillingPortal())}
          >
            Manage subscription
          </button>
        ) : (
          <button
            className="button button--primary"
            type="button"
            disabled={busy}
            onClick={() => void run(() => window.pilcrow.openCheckout())}
          >
            Upgrade — $9.99/month
          </button>
        )}

        <button
          className="button button--quiet"
          type="button"
          disabled={busy}
          onClick={() => void run(async () => window.pilcrow.signOut())}
        >
          Sign out
        </button>
      </div>

      <p className="field__hint">
        Your reading history and downloaded audio stay on this Mac, and keep working offline.
      </p>
    </section>
  )
}
