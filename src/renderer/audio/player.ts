import type { BellAudioApi } from '@/preload'

/**
 * Gapless streaming playback. Chunks arrive as complete mp3 buffers and are
 * appended to a single MediaSource SourceBuffer, so the browser stitches them
 * into one continuous stream rather than playing a series of separate clips.
 */

declare global {
  interface Window {
    bellAudio: BellAudioApi
  }
}

const MIME = 'audio/mpeg'

const player = document.getElementById('player') as HTMLAudioElement

interface Pending {
  utteranceId: string
  audio: ArrayBuffer
  isLast: boolean
}

let mediaSource: MediaSource | null = null
let sourceBuffer: SourceBuffer | null = null
let queue: Pending[] = []
let activeUtteranceId: string | null = null
let sawLastChunk = false

function teardown(): void {
  queue = []
  sawLastChunk = false
  activeUtteranceId = null

  if (sourceBuffer && mediaSource?.readyState === 'open') {
    try {
      mediaSource.endOfStream()
    } catch {
      // Already ended.
    }
  }

  player.pause()
  player.removeAttribute('src')
  player.load()
  sourceBuffer = null
  mediaSource = null
}

function drain(): void {
  if (!sourceBuffer || sourceBuffer.updating) return

  const next = queue.shift()
  if (!next) {
    // Only close the stream once the final chunk has actually been appended.
    if (sawLastChunk && mediaSource?.readyState === 'open') {
      try {
        mediaSource.endOfStream()
      } catch {
        // Racing with a teardown; nothing to do.
      }
    }
    return
  }

  try {
    sourceBuffer.appendBuffer(new Uint8Array(next.audio))
  } catch (error) {
    window.bellAudio.error(error instanceof Error ? error.message : 'Audio append failed.')
  }
}

function ensureStream(utteranceId: string): Promise<void> {
  if (mediaSource && activeUtteranceId === utteranceId) return Promise.resolve()

  teardown()
  activeUtteranceId = utteranceId

  return new Promise((resolve) => {
    const source = new MediaSource()
    mediaSource = source
    player.src = URL.createObjectURL(source)

    source.addEventListener(
      'sourceopen',
      () => {
        // Revoke as soon as the source is attached; the object URL is no longer
        // needed and would otherwise leak for the life of the window.
        URL.revokeObjectURL(player.src)

        try {
          sourceBuffer = source.addSourceBuffer(MIME)
        } catch (error) {
          window.bellAudio.error(
            error instanceof Error ? error.message : 'This system cannot decode mp3 streams.',
          )
          resolve()
          return
        }

        sourceBuffer.mode = 'sequence'
        sourceBuffer.addEventListener('updateend', drain)
        resolve()
      },
      { once: true },
    )
  })
}

window.bellAudio.onChunk(async (payload) => {
  await ensureStream(payload.utteranceId)

  queue.push({
    utteranceId: payload.utteranceId,
    audio: payload.audio,
    isLast: payload.isLast,
  })
  if (payload.isLast) sawLastChunk = true

  drain()

  if (player.paused) {
    // Autoplay is permitted here because the window is app-owned and the action
    // is user-initiated via the hotkey.
    void player.play().catch((error: unknown) => {
      window.bellAudio.error(error instanceof Error ? error.message : 'Playback failed.')
    })
  }
})

window.bellAudio.onReset(() => {
  teardown()
})

player.addEventListener('ended', () => {
  if (activeUtteranceId) window.bellAudio.finished(activeUtteranceId)
})

player.addEventListener('error', () => {
  const message = player.error?.message ?? 'Audio playback error.'
  window.bellAudio.error(message)
})
