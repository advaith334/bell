import { z } from 'zod'
import type { Chunk } from '@/main/text/pipeline'
import { BACKEND } from '@/shared/config'
import type { QuotaReason } from '@/shared/types'
import * as cache from './cache'
import * as auth from './auth'
import { api, describeFailure, OfflineError } from './http'

/**
 * Synthesis, through our backend rather than ElevenLabs directly.
 *
 * Users no longer bring an API key: Pilcrow's own key lives in Secrets Manager
 * and never leaves AWS. The client sends text and gets mp3 back, and the backend
 * decides whether it is allowed to.
 *
 * The on-disk cache is unchanged and is the reason replays stay instant — and,
 * now, free: a cache hit makes no network call at all, so it consumes no quota.
 * That was already the promise the README made about latency; it is now also the
 * billing behaviour.
 */

const API_BASE = BACKEND.ttsUrl

export class TtsError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly reason?: 'quota' | 'auth' | 'offline' | 'upstream',
    readonly quotaReason?: QuotaReason,
  ) {
    super(message)
    this.name = 'TtsError'
  }
}

const quotaErrorSchema = z.object({
  error: z.literal('quota_exhausted'),
  reason: z.enum(['free_reads', 'free_chars']),
  message: z.string(),
})

export interface SynthesizeParams {
  chunk: Chunk
  /** The utterance id. Ties every chunk of one read together so it is billed once. */
  readId: string
  chunkIndex: number
  /** The chunk before/after, so prosody carries across the seam. */
  previousText?: string
  nextText?: string
  voiceId: string
  modelId: string
  speed: number
  signal?: AbortSignal
}

/**
 * Synthesizes one chunk, returning complete mp3 bytes. Served from disk when the
 * same text/voice/model/speed has been spoken before.
 *
 * The response is streamed by the backend but buffered whole here, because the
 * audio renderer appends complete chunks to its SourceBuffer. Latency comes from
 * the deliberately small first chunk, not from progressive delivery.
 */
export async function synthesize(params: SynthesizeParams): Promise<{
  audio: Buffer
  key: string
  cached: boolean
  charsBilled: number
}> {
  const key = cache.cacheKey({
    text: params.chunk.ssml,
    voiceId: params.voiceId,
    modelId: params.modelId,
    speed: params.speed,
  })

  const cached = cache.read(key)
  if (cached) {
    return { audio: cached, key, cached: true, charsBilled: 0 }
  }

  if (!API_BASE) throw new TtsError('Pilcrow is not configured with a voice server.', undefined, 'upstream')

  const token = await auth.getAccessToken()
  if (!token) throw new TtsError('Sign in to Pilcrow to read aloud.', 401, 'auth')

  let response: Response
  try {
    response = await fetch(API_BASE, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        readId: params.readId,
        chunkIndex: params.chunkIndex,
        text: params.chunk.ssml,
        voiceId: params.voiceId,
        modelId: params.modelId,
        speed: params.speed,
        previousText: params.previousText,
        nextText: params.nextText,
      }),
      signal: params.signal,
    })
  } catch (error) {
    // An abort is the user pressing stop, not a failure — let it through
    // untouched so reader.ts can tell the difference.
    if ((error as Error)?.name === 'AbortError') throw error
    const described = describeFailure(error)
    if (described instanceof OfflineError) {
      throw new TtsError(described.message, undefined, 'offline')
    }
    throw new TtsError(described.message, undefined, 'upstream')
  }

  if (response.status === 402) {
    const parsed = quotaErrorSchema.safeParse(await response.json().catch(() => null))
    throw new TtsError(
      parsed.success ? parsed.data.message : 'You have used all your free reads.',
      402,
      'quota',
      parsed.success ? parsed.data.reason : 'free_reads',
    )
  }

  if (response.status === 401) {
    throw new TtsError('Your Pilcrow session expired. Sign in again.', 401, 'auth')
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new TtsError(messageForStatus(response.status, body), response.status, 'upstream')
  }

  const audio = Buffer.from(await response.arrayBuffer())
  cache.write(key, audio)

  return { audio, key, cached: false, charsBilled: params.chunk.ssml.length }
}

function messageForStatus(status: number, body: string): string {
  switch (status) {
    case 429:
      return 'Pilcrow is at capacity for a moment. Try again shortly.'
    case 502:
    case 503:
      return 'The voice service is having trouble. Try again in a moment.'
    default:
      return `Pilcrow could not read that (${status}). ${body.slice(0, 120)}`.trim()
  }
}

export interface Voice {
  voiceId: string
  name: string
  previewUrl?: string
}

const voicesSchema = z.object({
  voices: z.array(
    z.object({ voiceId: z.string(), name: z.string(), previewUrl: z.string().optional() }),
  ),
})

/**
 * The voice catalogue, proxied so the ElevenLabs key stays server-side. An empty
 * list is a survivable outcome — Settings falls back to the stock voice — so a
 * failure here does not throw.
 */
export async function listVoices(): Promise<Voice[]> {
  try {
    return voicesSchema.parse(await api.get('voices').json()).voices
  } catch {
    return []
  }
}
