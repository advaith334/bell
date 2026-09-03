import { UserEntity, UsageEntity, ReadEntity, pilcrow } from './entities.js'
import type { UserItem } from './entities.js'
import {
  FREE_READ_LIMIT,
  FREE_CHAR_LIMIT,
  PRO_MONTHLY_CHARS,
  currentPeriod,
  type Plan,
} from './plans.js'

/**
 * Everything that decides whether a user is allowed to synthesize, in one module
 * with no I/O of its own beyond DynamoDB, so it can be unit tested directly.
 *
 * The invariant that matters: a "read" is charged exactly once, no matter how
 * many chunks it is split into or how many times a chunk is retried.
 */

export type ConsumeOutcome =
  | { result: 'consumed' }
  /** A later chunk of a read already charged for. Proceed, do not charge again. */
  | { result: 'already_consumed' }
  | { result: 'quota_exhausted'; reason: 'free_reads' | 'free_chars' }

export interface Entitlement {
  plan: Plan
  status: string
  isActive: boolean
  currentPeriodEnd: number | null
  /** Null on Pro, where reads are not the limiting resource. */
  readsRemaining: number | null
  freeReadsUsed: number
  freeCharsUsed: number
  monthlyChars: number
  monthlyCharsIncluded: number | null
  /** True once a Pro user is past their allowance: still served, just slowed. */
  throttled: boolean
}

/**
 * Pro access survives cancellation until the period they already paid for ends,
 * which is what Stripe's own semantics imply and what a customer expects. A
 * `comped` flag short-circuits everything for the pre-launch users.
 */
export function isPro(user: Pick<UserItem, 'plan' | 'status' | 'currentPeriodEnd' | 'comped'>, now = Date.now()): boolean {
  if (user.comped) return true
  if (user.plan !== 'pro') return false
  if (user.status === 'active' || user.status === 'trialing') return true
  // Canceled or past_due but still inside the paid period.
  return typeof user.currentPeriodEnd === 'number' && user.currentPeriodEnd > now
}

export function describeEntitlement(user: UserItem, monthlyChars: number, now = Date.now()): Entitlement {
  const pro = isPro(user, now)
  return {
    plan: pro ? 'pro' : 'free',
    status: user.status,
    isActive: pro,
    currentPeriodEnd: user.currentPeriodEnd ?? null,
    readsRemaining: pro ? null : Math.max(0, FREE_READ_LIMIT - user.freeReadsUsed),
    freeReadsUsed: user.freeReadsUsed,
    freeCharsUsed: user.freeCharsUsed,
    monthlyChars,
    monthlyCharsIncluded: pro ? PRO_MONTHLY_CHARS : null,
    throttled: pro && monthlyChars >= PRO_MONTHLY_CHARS,
  }
}

/** Idempotent upsert of the identity fields. Called on every `/me`. */
export async function ensureUser(userId: string, email?: string, provider?: string): Promise<UserItem> {
  await UserEntity.upsert({ userId })
    .set({ ...(email ? { email } : {}), ...(provider ? { provider } : {}) })
    .go()

  const { data } = await UserEntity.get({ userId }).go()
  if (!data) throw new Error(`User ${userId} vanished immediately after upsert`)
  return data
}

export async function getMonthlyChars(userId: string, period = currentPeriod()): Promise<number> {
  const { data } = await UsageEntity.get({ userId, period }).go()
  return data?.chars ?? 0
}

/**
 * Claims a read for `readId` and charges the trial counters if the user is on the
 * free plan. Atomic across both items: either the ledger entry is created AND the
 * counters move, or neither happens.
 *
 * Characters are NOT charged here. We do not know the length of the whole
 * selection up front, and a client-supplied total would be trivially forgeable —
 * so the character ceiling is enforced by `recordSynthesis` after the fact, which
 * means it stops the NEXT read rather than this one. That is intentional: cutting
 * someone off mid-paragraph to save $0.10 is a bad trade, and the per-request cap
 * already bounds how far over they can get.
 */
export async function consumeRead(params: {
  userId: string
  readId: string
  pro: boolean
}): Promise<ConsumeOutcome> {
  const { userId, readId, pro } = params

  try {
    const transaction = await pilcrow.transaction
      .write(({ read, user }) => [
        // `create` is a Put with attribute_not_exists on the key — this is the
        // deduplication.
        read.create({ userId, readId, plan: pro ? 'pro' : 'free' }).commit(),

        pro
          ? user.upsert({ userId }).set({ plan: 'pro' }).commit()
          : user
              .upsert({ userId })
              .add({ freeReadsUsed: 1 })
              .where(
                (attr, op) =>
                  // An absent attribute means a brand new user, who is trivially
                  // under the limit. Without the notExists arms, a first-time
                  // user would be told their trial was over.
                  `(${op.notExists(attr.freeReadsUsed)} OR ${op.lt(attr.freeReadsUsed, FREE_READ_LIMIT)}) AND ` +
                  `(${op.notExists(attr.freeCharsUsed)} OR ${op.lt(attr.freeCharsUsed, FREE_CHAR_LIMIT)})`,
              )
              .commit(),
      ])
      .go()

    if (!transaction.canceled) return { result: 'consumed' }

    const [readResult, userResult] = transaction.data
    if (readResult?.rejected) return { result: 'already_consumed' }
    if (userResult?.rejected) return { result: 'quota_exhausted', reason: await whichLimit(userId) }

    // Canceled for a reason that is not one of our conditions — throughput,
    // most likely. Surface it as an error rather than a paywall.
    throw new Error(`Read transaction canceled unexpectedly for ${userId}/${readId}`)
  } catch (error) {
    if (isConditionalFailure(error)) return { result: 'already_consumed' }
    throw error
  }
}

/** Only called on the paywall path, so the extra read costs nothing in the common case. */
async function whichLimit(userId: string): Promise<'free_reads' | 'free_chars'> {
  const { data } = await UserEntity.get({ userId }).go()
  return (data?.freeReadsUsed ?? 0) >= FREE_READ_LIMIT ? 'free_reads' : 'free_chars'
}

function isConditionalFailure(error: unknown): boolean {
  const name = (error as { name?: string; code?: string })?.name ?? (error as { code?: string })?.code
  return name === 'ConditionalCheckFailedException' || name === 'TransactionCanceledException'
}

/**
 * Records characters actually synthesized, after the audio has streamed. Separate
 * from `consumeRead` because we only want to bill for bytes the user received —
 * a failed ElevenLabs call must not count against anyone.
 */
export async function recordSynthesis(params: {
  userId: string
  readId: string
  chars: number
  pro: boolean
}): Promise<void> {
  const { userId, readId, chars, pro } = params
  const period = currentPeriod()

  await Promise.all([
    UsageEntity.upsert({ userId, period }).add({ chars, reads: 0 }).go(),
    ReadEntity.patch({ userId, readId }).add({ chars, chunks: 1 }).go().catch(() => {}),
    // Free users are charged against the trial ceiling by real usage too, so a
    // single enormous read cannot slip past the 30,000 character cap.
    pro ? Promise.resolve() : UserEntity.upsert({ userId }).add({ freeCharsUsed: chars }).go(),
  ])
}
