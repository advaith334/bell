import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * The entitlement rules are the only place in the system where a bug costs real
 * money in either direction — undercharging burns ElevenLabs credit, overcharging
 * locks out someone who paid. So they are tested directly rather than through the
 * handlers.
 */

const transactionWrite = vi.fn()
const userGet = vi.fn()

vi.mock('../entities.js', () => ({
  pilcrow: { transaction: { write: (build: unknown) => ({ go: () => transactionWrite(build) }) } },
  UserEntity: {
    get: () => ({ go: userGet }),
    upsert: () => ({ set: () => ({ go: vi.fn() }), add: () => ({ go: vi.fn() }) }),
  },
  UsageEntity: { get: () => ({ go: vi.fn() }), upsert: () => ({ add: () => ({ go: vi.fn() }) }) },
  ReadEntity: { patch: () => ({ add: () => ({ go: vi.fn() }) }) },
}))

const { consumeRead, describeEntitlement, isPro } = await import('../entitlement.js')
const { FREE_READ_LIMIT, PRO_MONTHLY_CHARS, currentPeriod } = await import('../plans.js')

const baseUser = {
  userId: 'u1',
  plan: 'free' as const,
  status: 'none' as const,
  freeReadsUsed: 0,
  freeCharsUsed: 0,
  createdAt: 0,
  updatedAt: 0,
}

beforeEach(() => {
  transactionWrite.mockReset()
  userGet.mockReset()
})

describe('isPro', () => {
  const now = 1_000_000

  it('is false for a free user', () => {
    expect(isPro(baseUser, now)).toBe(false)
  })

  it('is true while the subscription is active', () => {
    expect(isPro({ ...baseUser, plan: 'pro', status: 'active' }, now)).toBe(true)
  })

  it('honours a cancelled subscription until the period they paid for ends', () => {
    const cancelled = { ...baseUser, plan: 'pro' as const, status: 'canceled' as const }
    expect(isPro({ ...cancelled, currentPeriodEnd: now + 1 }, now)).toBe(true)
    expect(isPro({ ...cancelled, currentPeriodEnd: now - 1 }, now)).toBe(false)
  })

  it('treats a comped user as pro regardless of Stripe state', () => {
    expect(isPro({ ...baseUser, comped: true }, now)).toBe(true)
  })
})

describe('describeEntitlement', () => {
  it('counts down remaining free reads', () => {
    const result = describeEntitlement({ ...baseUser, freeReadsUsed: 3 }, 0)
    expect(result.readsRemaining).toBe(FREE_READ_LIMIT - 3)
    expect(result.plan).toBe('free')
  })

  it('never reports a negative remaining count', () => {
    const result = describeEntitlement({ ...baseUser, freeReadsUsed: FREE_READ_LIMIT + 5 }, 0)
    expect(result.readsRemaining).toBe(0)
  })

  it('reports no read limit on pro, and throttles past the monthly allowance', () => {
    const pro = { ...baseUser, plan: 'pro' as const, status: 'active' as const }
    expect(describeEntitlement(pro, 0).readsRemaining).toBeNull()
    expect(describeEntitlement(pro, PRO_MONTHLY_CHARS - 1).throttled).toBe(false)
    expect(describeEntitlement(pro, PRO_MONTHLY_CHARS).throttled).toBe(true)
  })
})

describe('consumeRead', () => {
  it('charges once when the read is new', async () => {
    transactionWrite.mockResolvedValue({ canceled: false, data: [] })
    await expect(consumeRead({ userId: 'u1', readId: 'r1', pro: false })).resolves.toEqual({
      result: 'consumed',
    })
  })

  it('does NOT charge again when the ledger entry already exists', async () => {
    // This is the invariant that keeps a five-chunk read from costing five reads.
    transactionWrite.mockResolvedValue({
      canceled: true,
      data: [{ rejected: true, code: 'ConditionalCheckFailed' }, { rejected: false }],
    })
    await expect(consumeRead({ userId: 'u1', readId: 'r1', pro: false })).resolves.toEqual({
      result: 'already_consumed',
    })
  })

  it('returns a paywall when the free read condition fails', async () => {
    transactionWrite.mockResolvedValue({
      canceled: true,
      data: [{ rejected: false }, { rejected: true, code: 'ConditionalCheckFailed' }],
    })
    userGet.mockResolvedValue({ data: { ...baseUser, freeReadsUsed: FREE_READ_LIMIT } })

    await expect(consumeRead({ userId: 'u1', readId: 'r1', pro: false })).resolves.toEqual({
      result: 'quota_exhausted',
      reason: 'free_reads',
    })
  })

  it('distinguishes the character ceiling from the read ceiling', async () => {
    transactionWrite.mockResolvedValue({
      canceled: true,
      data: [{ rejected: false }, { rejected: true, code: 'ConditionalCheckFailed' }],
    })
    userGet.mockResolvedValue({ data: { ...baseUser, freeReadsUsed: 2, freeCharsUsed: 30_000 } })

    await expect(consumeRead({ userId: 'u1', readId: 'r1', pro: false })).resolves.toEqual({
      result: 'quota_exhausted',
      reason: 'free_chars',
    })
  })

  it('never paywalls a pro user', async () => {
    transactionWrite.mockResolvedValue({ canceled: false, data: [] })
    await expect(consumeRead({ userId: 'u1', readId: 'r1', pro: true })).resolves.toEqual({
      result: 'consumed',
    })
  })

  it('treats a bare ConditionalCheckFailedException as an already-charged read', async () => {
    const error = Object.assign(new Error('nope'), { name: 'ConditionalCheckFailedException' })
    transactionWrite.mockRejectedValue(error)
    await expect(consumeRead({ userId: 'u1', readId: 'r1', pro: false })).resolves.toEqual({
      result: 'already_consumed',
    })
  })
})

describe('currentPeriod', () => {
  it('keys by UTC month so a timezone cannot double-count an allowance', () => {
    expect(currentPeriod(new Date('2026-03-01T00:30:00Z'))).toBe('2026-03')
    expect(currentPeriod(new Date('2026-02-28T23:30:00Z'))).toBe('2026-02')
    expect(currentPeriod(new Date('2026-11-05T12:00:00Z'))).toBe('2026-11')
  })
})
