import { useState } from 'react'
import type { QuotaReason } from '@/shared/types'
import { CloseIcon } from './icons'

/**
 * The paywall. It appears at the moment someone tries their twenty-first read,
 * which is the only moment the offer is actually relevant — not at launch, and
 * not as a nagging banner.
 */

interface Props {
  reason: QuotaReason | null
  freeReadLimit: number
  onClose: () => void
}

const BENEFITS = [
  'Unlimited reads, in the same voice',
  'No API key and no per-word billing to think about',
  'Everything you have already read stays instant and offline',
]

export function UpgradeSheet({ reason, freeReadLimit, onClose }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const upgrade = async () => {
    setBusy(true)
    setError(null)
    const result = await window.pilcrow.openCheckout()
    setBusy(false)
    if (!result.ok) setError(result.error ?? 'Could not open checkout.')
  }

  return (
    <div className="modal__backdrop" onClick={onClose}>
      <div className="modal modal--narrow" onClick={(event) => event.stopPropagation()}>
        <header className="modal__header">
          <h2>Keep reading</h2>
          <button onClick={onClose} type="button" title="Close">
            <CloseIcon />
          </button>
        </header>

        <div className="modal__body">
          <p className="upgrade__lede">
            {reason === 'free_chars'
              ? 'You have used the free characters that come with Pilcrow.'
              : `You have used all ${freeReadLimit} free reads.`}
          </p>

          <ul className="upgrade__benefits">
            {BENEFITS.map((benefit) => (
              <li key={benefit}>{benefit}</li>
            ))}
          </ul>

          <div className="upgrade__price">
            <span className="upgrade__amount">$9.99</span>
            <span className="upgrade__period">per month</span>
          </div>

          <button
            className="button button--primary button--large"
            type="button"
            disabled={busy}
            onClick={() => void upgrade()}
          >
            {busy ? 'Opening checkout…' : 'Subscribe'}
          </button>

          <p className="field__hint">
            Payment is handled by Stripe, in your browser. Cancel any time — access runs to the end
            of the period you paid for.
          </p>

          {error && <p className="signin__error">{error}</p>}
        </div>
      </div>
    </div>
  )
}
