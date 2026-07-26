import type { RenderedBlock } from './pauses'
import { breakTag } from './pauses'

/**
 * The first chunk is deliberately tiny so audio starts as soon as possible;
 * later chunks are larger because prosody is better over longer spans and each
 * request costs a round trip.
 */
const FIRST_CHUNK_TARGET = 180
const CHUNK_TARGET = 800
const CHUNK_MAX = 1200

/** ElevenLabs tolerates only a handful of break tags per request. */
const MAX_BREAKS_PER_CHUNK = 4

export interface Chunk {
  /** Text with break tags, as sent to the API. */
  ssml: string
  /** Text without break tags, for `previous_text`/`next_text` and the UI. */
  plain: string
  index: number
}

const sentenceSegmenter = new Intl.Segmenter('en', { granularity: 'sentence' })

/** Splits a long block into sentences so we never cut mid-sentence. */
function toSentences(text: string): string[] {
  const segments = Array.from(sentenceSegmenter.segment(text), (segment) => segment.segment.trim())
  return segments.filter((segment) => segment.length > 0)
}

/**
 * Groups rendered blocks into request-sized chunks, splitting on sentence
 * boundaries and never inside a break tag.
 */
export function chunk(blocks: RenderedBlock[]): Chunk[] {
  const chunks: Chunk[] = []

  let ssmlParts: string[] = []
  let plainParts: string[] = []
  let length = 0
  let breaks = 0

  const target = () => (chunks.length === 0 ? FIRST_CHUNK_TARGET : CHUNK_TARGET)

  const flush = () => {
    if (plainParts.length === 0) return
    chunks.push({
      ssml: ssmlParts.join(' ').replace(/\s{2,}/g, ' ').trim(),
      plain: plainParts.join(' ').replace(/\s{2,}/g, ' ').trim(),
      index: chunks.length,
    })
    ssmlParts = []
    plainParts = []
    length = 0
    breaks = 0
  }

  const push = (text: string, pauseMs: number) => {
    const tag = breaks < MAX_BREAKS_PER_CHUNK ? breakTag(pauseMs) : ''
    ssmlParts.push(tag ? `${text} ${tag}` : text)
    plainParts.push(text)
    length += text.length
    if (tag) breaks += 1
  }

  for (const block of blocks) {
    // A block that fits goes in whole, which keeps its trailing pause attached.
    if (length + block.text.length <= CHUNK_MAX) {
      push(block.text, block.pauseMs)
      if (length >= target()) flush()
      continue
    }

    // Oversized block: split by sentence. Only the final sentence carries the
    // block's trailing pause.
    const sentences = toSentences(block.text)
    sentences.forEach((sentence, sentenceIndex) => {
      const isLast = sentenceIndex === sentences.length - 1
      if (length > 0 && length + sentence.length > CHUNK_MAX) flush()
      push(sentence, isLast ? block.pauseMs : 0)
      if (length >= target()) flush()
    })
  }

  flush()
  return chunks
}
