/**
 * The commercial parameters, in one place, because they are the numbers most
 * likely to change and the ones it is most expensive to get wrong.
 *
 * ElevenLabs Flash v2.5 costs $0.05 per 1,000 characters and that rate does not
 * fall on higher plans — paid tiers bundle more included credits rather than
 * discounting the unit. So every limit here is a margin decision, not a
 * politeness:
 *
 *   a free user who exhausts the trial costs us  FREE_CHAR_LIMIT * $0.00005
 *   a subscriber at the ceiling costs us          PRO_MONTHLY_CHARS * $0.00005
 *   a $9.99 subscription nets $9.40 after Stripe
 *
 * At the values below that is $1.50 of trial per never-converting signup, and
 * $7.50 against $9.40 for a subscriber who actually hits the ceiling.
 */

export type Plan = 'free' | 'pro'

/** Reads granted before the paywall. A "read" is one hotkey press that synthesizes. */
export const FREE_READ_LIMIT = 20

/**
 * A second, independent ceiling on the trial. Without it, twenty 5,000-character
 * reads would cost us $5.00 for a single user who may never pay.
 */
export const FREE_CHAR_LIMIT = 30_000

/** Characters included per month on Pro before the soft throttle. */
export const PRO_MONTHLY_CHARS = 150_000

/**
 * Past the monthly allowance we slow down rather than cut off. A hard stop on a
 * paying customer mid-article is worse for churn than the marginal cost of
 * letting them finish.
 */
export const PRO_THROTTLE_DELAY_MS = 1_500

/** Hard per-request ceiling, applied to every plan. Mirrors the client's maxChars default. */
export const MAX_CHARS_PER_REQUEST = 5_000

/** Cost model, used only for the CloudWatch metric that tells us if the above is wrong. */
export const USD_PER_1K_CHARS = 0.05

export const STRIPE_PRICE_LOOKUP_KEY = 'pilcrow_pro_monthly'

export function estimatedCostUsd(chars: number): number {
  return (chars / 1_000) * USD_PER_1K_CHARS
}

/** The current billing month, used to key MonthlyUsage. UTC so it never double-counts across zones. */
export function currentPeriod(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
}
