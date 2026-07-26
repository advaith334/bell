import type { Chunk } from '@/main/text/pipeline'
import * as cache from './cache'

const API_BASE = 'https://api.elevenlabs.io/v1'
const OUTPUT_FORMAT = 'mp3_44100_128'

export class ElevenLabsError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'ElevenLabsError'
  }
}

export interface SynthesizeParams {
  chunk: Chunk
  /** The chunk before/after, so prosody carries across the seam. */
  previousText?: string
  nextText?: string
  apiKey: string
  voiceId: string
  modelId: string
  speed: number
  signal?: AbortSignal
}

function messageForStatus(status: number, body: string): string {
  switch (status) {
    case 401:
      return 'ElevenLabs rejected the API key.'
    case 422:
      return `ElevenLabs could not process the text: ${body.slice(0, 200)}`
    case 429:
      return 'ElevenLabs rate limit reached. Try again in a moment.'
    default:
      return `ElevenLabs request failed (${status}): ${body.slice(0, 200)}`
  }
}

/**
 * Synthesizes one chunk, returning complete mp3 bytes. Served from disk when
 * the same text/voice/model/speed has been spoken before.
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

  const url = `${API_BASE}/text-to-speech/${params.voiceId}/stream?output_format=${OUTPUT_FORMAT}`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': params.apiKey,
      'content-type': 'application/json',
      accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text: params.chunk.ssml,
      model_id: params.modelId,
      // Prosody continuity across chunk seams; without these each chunk sounds
      // like a fresh take.
      previous_text: params.previousText,
      next_text: params.nextText,
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        speed: params.speed,
      },
    }),
    signal: params.signal,
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new ElevenLabsError(messageForStatus(response.status, body), response.status)
  }

  const audio = Buffer.from(await response.arrayBuffer())
  cache.write(key, audio)

  return { audio, key, cached: false, charsBilled: params.chunk.ssml.length }
}

export interface Voice {
  voiceId: string
  name: string
  previewUrl?: string
}

export async function listVoices(apiKey: string): Promise<Voice[]> {
  const response = await fetch(`${API_BASE}/voices`, {
    headers: { 'xi-api-key': apiKey },
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new ElevenLabsError(messageForStatus(response.status, body), response.status)
  }

  const data = (await response.json()) as {
    voices?: Array<{ voice_id: string; name: string; preview_url?: string }>
  }

  return (data.voices ?? []).map((voice) => ({
    voiceId: voice.voice_id,
    name: voice.name,
    previewUrl: voice.preview_url,
  }))
}

export async function verifyKey(apiKey: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/user`, { headers: { 'xi-api-key': apiKey } })
    return response.ok
  } catch {
    return false
  }
}
