import { randomUUID } from 'node:crypto'
import type { PlaybackStatus, Utterance } from '@/shared/types'
import { normalizeToChunks, type Chunk } from '@/main/text/pipeline'
import * as db from '@/main/db'
import * as cache from './cache'
import * as settings from './settings'
import * as selection from './selection'
import { ElevenLabsError, synthesize } from './elevenlabs'

/**
 * Orchestrates one read-aloud session: capture, normalize, then synthesize
 * chunks just ahead of playback so the first sound arrives quickly and we never
 * pay for audio the user stops before hearing.
 */

/** How many chunks to keep synthesized ahead of the one playing. */
const PREFETCH_DEPTH = 2

export interface ReaderCallbacks {
  onStatus: (status: PlaybackStatus) => void
  /** Hands complete mp3 bytes to the audio renderer for gapless append. */
  onAudio: (utteranceId: string, chunkIndex: number, audio: Buffer, isLast: boolean) => void
  /**
   * Tears down playback in the audio renderer. Aborting synthesis is not enough
   * to stop the sound: whatever was already buffered keeps playing until the
   * renderer is told to drop it.
   */
  onReset: () => void
}

interface Session {
  id: string
  chunks: Chunk[]
  controller: AbortController
  startedAt: number
  charsBilled: number
  stopped: boolean
}

let current: Session | null = null
let callbacks: ReaderCallbacks | null = null

export function init(next: ReaderCallbacks): void {
  callbacks = next
}

function emit(status: PlaybackStatus): void {
  callbacks?.onStatus(status)
}

export function isActive(): boolean {
  return current !== null
}

/** Stops playback and records how far the user actually got. */
export function stop(): void {
  // Always reset the renderer, even with no session tracked here — otherwise a
  // desynced state would leave audio playing with no way to silence it.
  callbacks?.onReset()

  if (!current) return

  const session = current
  session.stopped = true
  session.controller.abort()
  current = null

  db.finish(session.id, Date.now() - session.startedAt, false)
  emit({ state: 'idle' })
}

/**
 * Called by the audio renderer when the queue drains, so the duration we record
 * is real playback time rather than synthesis time.
 */
export function markFinished(utteranceId: string): void {
  if (!current || current.id !== utteranceId) return

  const session = current
  current = null
  db.finish(session.id, Date.now() - session.startedAt, true)
  emit({ state: 'idle' })
}

async function synthesizeChunk(session: Session, index: number): Promise<number> {
  const config = settings.load()
  const apiKey = settings.getApiKey()
  if (!apiKey) throw new ElevenLabsError('No ElevenLabs API key is set.')

  const chunk = session.chunks[index]
  const result = await synthesize({
    chunk,
    previousText: session.chunks[index - 1]?.plain,
    nextText: session.chunks[index + 1]?.plain,
    apiKey,
    voiceId: config.voiceId,
    modelId: config.modelId,
    speed: config.speed,
    signal: session.controller.signal,
  })

  if (session.stopped) return 0

  callbacks?.onAudio(session.id, index, result.audio, index === session.chunks.length - 1)
  return result.charsBilled
}

/**
 * Synthesizes chunks with a bounded look-ahead. Sequential rather than
 * all-at-once so a long selection that the user stops after ten seconds does
 * not bill for the whole thing.
 */
async function pump(session: Session): Promise<void> {
  let inFlight: Array<Promise<number>> = []

  for (let index = 0; index < session.chunks.length; index += 1) {
    if (session.stopped) break

    inFlight.push(synthesizeChunk(session, index))

    if (inFlight.length >= PREFETCH_DEPTH) {
      const billed = await inFlight.shift()!
      session.charsBilled += billed
      if (billed > 0) db.addCharsBilled(session.id, billed)
    }
  }

  for (const pending of inFlight) {
    if (session.stopped) break
    const billed = await pending
    session.charsBilled += billed
    if (billed > 0) db.addCharsBilled(session.id, billed)
  }

  inFlight = []
}

export interface ReadOptions {
  /** Skip capture and read this text instead — used by the replay button. */
  text?: string
  sourceApp?: string
  sourceName?: string
}

export async function read(options: ReadOptions = {}): Promise<void> {
  // A second press while speaking is a stop, which is the behaviour people
  // expect from a single-key toggle.
  if (current) {
    stop()
    return
  }

  // Clear any audio still buffered from a previous read before starting.
  callbacks?.onReset()

  const config = settings.load()

  if (!settings.hasApiKey()) {
    emit({ state: 'error', error: 'Add your ElevenLabs API key in Settings first.' })
    return
  }

  emit({ state: 'capturing' })

  let text = options.text
  let sourceApp = options.sourceApp
  let sourceName = options.sourceName

  if (text === undefined) {
    try {
      const captured = await selection.capture()
      text = captured.text
      sourceApp = captured.sourceApp
      sourceName = captured.sourceName
    } catch (error) {
      emit({ state: 'error', error: error instanceof Error ? error.message : String(error) })
      return
    }
  }

  if (text.length > config.maxChars) {
    emit({
      state: 'error',
      error: `That selection is ${text.length.toLocaleString()} characters, over the ${config.maxChars.toLocaleString()} limit.`,
    })
    return
  }

  emit({ state: 'thinking' })

  const { result, chunks } = normalizeToChunks(text, {
    codePolicy: config.codePolicy,
    pauses: config.pauses,
    sourceApp,
  })

  if (chunks.length === 0) {
    emit({ state: 'error', error: 'There was nothing speakable in that selection.' })
    return
  }

  const utterance: Utterance = {
    id: randomUUID(),
    createdAt: Date.now(),
    rawText: text,
    spokenText: result.plain,
    wordCount: result.wordCount,
    durationMs: null,
    completed: false,
    sourceApp: sourceApp ?? null,
    sourceName: sourceName ?? null,
    sourceKind: result.sourceKind,
    voiceId: config.voiceId,
    modelId: config.modelId,
    cacheKey: cache.cacheKey({
      text: result.ssml,
      voiceId: config.voiceId,
      modelId: config.modelId,
      speed: config.speed,
    }),
    charsBilled: 0,
  }

  db.insert(utterance)

  const session: Session = {
    id: utterance.id,
    chunks,
    controller: new AbortController(),
    startedAt: Date.now(),
    charsBilled: 0,
    stopped: false,
  }
  current = session

  emit({ state: 'speaking', utteranceId: session.id, currentText: result.plain, progress: 0 })

  try {
    await pump(session)
  } catch (error) {
    if (session.stopped) return
    current = null
    db.finish(session.id, Date.now() - session.startedAt, false)
    emit({ state: 'error', error: error instanceof Error ? error.message : String(error) })
    return
  }

  cache.sweep()
}

/** Replays a stored utterance. Cached chunks make this instant and free. */
export async function replay(utteranceId: string): Promise<void> {
  const utterance = db.get(utteranceId)
  if (!utterance) return

  if (current) stop()

  await read({
    text: utterance.rawText,
    sourceApp: utterance.sourceApp ?? undefined,
    sourceName: utterance.sourceName ?? undefined,
  })
}
