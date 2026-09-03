import type { PlaybackStatus } from '@/shared/types'

/**
 * The entitlement gate in `reader.read()`.
 *
 * The text pipeline has its own regression suite; what is untested and expensive
 * to get wrong is the branch that decides whether a read is allowed to start at
 * all, and what happens when the server refuses one that already has.
 */

jest.mock('electron', () => ({
  app: { getPath: () => '/tmp/pilcrow-test', isPackaged: false },
}))

const blockedReason = jest.fn<'needs-auth' | 'needs-upgrade' | null, []>()
const refreshSoon = jest.fn()
const capture = jest.fn()
const synthesize = jest.fn()

jest.mock('@/main/services/account', () => ({ blockedReason, refreshSoon }))
jest.mock('@/main/services/selection', () => ({ capture }))
jest.mock('@/main/services/tts', () => {
  class TtsError extends Error {
    constructor(
      message: string,
      readonly status?: number,
      readonly reason?: string,
      readonly quotaReason?: string,
    ) {
      super(message)
      this.name = 'TtsError'
    }
  }
  return { TtsError, synthesize }
})
jest.mock('@/main/db', () => ({
  insert: jest.fn(),
  finish: jest.fn(),
  addCharsBilled: jest.fn(),
  get: jest.fn(),
}))
jest.mock('@/main/services/cache', () => ({
  cacheKey: () => 'key',
  sweep: jest.fn(),
  read: () => null,
  write: jest.fn(),
}))
jest.mock('@/main/services/settings', () => ({
  load: () => ({
    voiceId: 'v',
    modelId: 'eleven_flash_v2_5',
    speed: 1,
    codePolicy: 'announce',
    pauses: { lineMs: 150, listItemMs: 350, paragraphMs: 700, headingMs: 1000, sectionMs: 1200 },
    maxChars: 5000,
  }),
}))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const reader = require('@/main/services/reader') as typeof import('@/main/services/reader')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { TtsError } = require('@/main/services/tts') as {
  TtsError: new (message: string, status?: number, reason?: string, quotaReason?: string) => Error
}

let statuses: PlaybackStatus[] = []

beforeEach(() => {
  statuses = []
  blockedReason.mockReset().mockReturnValue(null)
  refreshSoon.mockReset()
  capture.mockReset().mockResolvedValue({ text: 'Hello there.', sourceApp: 'com.test', sourceName: 'Test' })
  synthesize.mockReset().mockResolvedValue({ audio: Buffer.from(''), key: 'k', cached: false, charsBilled: 12 })

  reader.init({
    onStatus: (status) => statuses.push(status),
    onAudio: jest.fn(),
    onReset: jest.fn(),
  })
  reader.stop()
  statuses = []
})

const states = () => statuses.map((status) => status.state)

describe('the entitlement gate', () => {
  it('asks for sign-in before capturing anything', async () => {
    blockedReason.mockReturnValue('needs-auth')
    await reader.read()

    expect(states()).toEqual(['needs-auth'])
    // Nothing was captured: a signed-out user should never have their selection
    // read off the screen, let alone sent anywhere.
    expect(capture).not.toHaveBeenCalled()
    expect(synthesize).not.toHaveBeenCalled()
  })

  it('shows the paywall before capturing when the free reads are gone', async () => {
    blockedReason.mockReturnValue('needs-upgrade')
    await reader.read()

    expect(states()).toEqual(['needs-upgrade'])
    expect(statuses[0].quotaReason).toBe('free_reads')
    expect(capture).not.toHaveBeenCalled()
  })

  it('proceeds when nothing is blocking', async () => {
    await reader.read()

    expect(states()).toEqual(['capturing', 'thinking', 'speaking'])
    expect(synthesize).toHaveBeenCalled()
  })

  it('passes the utterance id as the read id, so every chunk bills once', async () => {
    await reader.read({ text: 'One. Two. Three.' })

    const speaking = statuses.find((status) => status.state === 'speaking')
    const readIds = new Set(synthesize.mock.calls.map((call) => call[0].readId))

    expect(readIds.size).toBe(1)
    expect([...readIds][0]).toBe(speaking?.utteranceId)
  })
})

describe('a refusal partway through a read', () => {
  it('turns a 402 into the paywall rather than an error', async () => {
    synthesize.mockRejectedValue(new TtsError('out of reads', 402, 'quota', 'free_chars'))
    await reader.read({ text: 'Hello there.' })

    expect(states()).toContain('needs-upgrade')
    expect(states()).not.toContain('error')
    expect(statuses.at(-1)?.quotaReason).toBe('free_chars')
    // The remaining-reads card must catch up without waiting for a poll.
    expect(refreshSoon).toHaveBeenCalled()
  })

  it('turns an expired session into a sign-in prompt', async () => {
    synthesize.mockRejectedValue(new TtsError('expired', 401, 'auth'))
    await reader.read({ text: 'Hello there.' })

    expect(states()).toContain('needs-auth')
    expect(states()).not.toContain('error')
  })

  it('still reports a genuine failure as an error', async () => {
    synthesize.mockRejectedValue(new TtsError('the voice service fell over', 502, 'upstream'))
    await reader.read({ text: 'Hello there.' })

    expect(states()).toContain('error')
    expect(states()).not.toContain('needs-upgrade')
  })
})
