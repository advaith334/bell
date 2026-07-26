import type { SourceKind } from '@/shared/types'
import { SHELL_PROMPT } from './source'

/**
 * A newline is only a pause if it is a real paragraph break. Everything in this
 * file exists to tell those two cases apart, because getting it wrong is what
 * makes read-aloud tools sound robotic on hard-wrapped text.
 */

const LIST_ITEM = /^\s{0,6}(?:[-*+•]|\d+[.)])\s+\S/
const HEADING = /^\s{0,3}#{1,6}\s+\S/
const QUOTE = /^\s{0,3}>+\s?/
const FENCE = /^\s{0,3}(?:```|~~~)/
const SECTION_RULE = /^\s{0,3}(?:[-*_]\s?){3,}$/
const TABLE_ROW = /^\s*\|.*\|\s*$/

/** Ends a sentence, so the following line is safe to treat as a new one. */
const SENTENCE_END = /[.!?:;"')\]]$/

/** Ends mid-thought — a wrapped line almost always ends on one of these. */
const CONTINUATION_END = /[,\-([{&/]$|\b(?:and|or|but|the|a|an|of|to|in|for|with|that|is|are|was|were|by|on|at|as)$/i

const ABBREVIATION_END = /\b(?:e\.g|i\.e|etc|vs|Mr|Mrs|Ms|Dr|Prof|Inc|Ltd|Co|St|Ave|No|Fig|approx|cf|al)\.$/i

export interface ReflowLine {
  text: string
  /**
   * True only when a blank line (or a fence boundary) followed — a genuine
   * paragraph break. Adjacent lines that merely failed the wrap test are
   * `false`, so they can be spoken as a run of output rather than as separate
   * paragraphs. This distinction is what keeps terminal output from pausing
   * after every line.
   */
  hardBreak: boolean
}

/**
 * The width a hard-wrapped block was wrapped at. Computed as the modal length
 * of the longer lines, which is robust to a short final line in each paragraph.
 */
export function detectWrapWidth(lines: string[]): number | null {
  const lengths = lines.map((line) => line.length).filter((length) => length >= 40)
  if (lengths.length < 3) return null

  const buckets = new Map<number, number>()
  for (const length of lengths) {
    // Bucket by 5 so widths jittering between 78 and 80 still agree.
    const bucket = Math.round(length / 5) * 5
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1)
  }

  let bestBucket = 0
  let bestCount = 0
  for (const [bucket, count] of buckets) {
    if (count > bestCount) {
      bestBucket = bucket
      bestCount = count
    }
  }

  // Needs a real cluster, not just two lines that happen to be similar.
  if (bestCount < 3 || bestCount / lengths.length < 0.5) return null
  return bestBucket
}

function indentOf(line: string): number {
  const match = line.match(/^ */)
  return match ? match[0].length : 0
}

function isStructural(line: string): boolean {
  return (
    LIST_ITEM.test(line) ||
    HEADING.test(line) ||
    QUOTE.test(line) ||
    FENCE.test(line) ||
    SECTION_RULE.test(line) ||
    TABLE_ROW.test(line)
  )
}

/**
 * Decides whether `next` continues the sentence started on `current`, in which
 * case the two are joined with a space instead of a pause.
 */
function isWrapContinuation(
  current: string,
  next: string,
  wrapWidth: number | null,
  sourceKind: SourceKind,
): boolean {
  const trimmedCurrent = current.trim()
  const trimmedNext = next.trim()

  if (trimmedCurrent.length === 0 || trimmedNext.length === 0) return false

  // Structure always wins over wrapping heuristics.
  if (isStructural(next)) return false

  // A shell prompt means a new command, which is genuinely a new thought.
  if (sourceKind === 'terminal' && SHELL_PROMPT.test(next)) return false

  // A sharp indentation change signals a code block or quoted email.
  if (Math.abs(indentOf(current) - indentOf(next)) >= 4) return false

  // Mid-thought endings are the clearest possible wrap signal.
  if (CONTINUATION_END.test(trimmedCurrent)) return true

  // An abbreviation's period is not a sentence end.
  if (ABBREVIATION_END.test(trimmedCurrent)) return true

  // Real sentence end: let it break, unless it is also at the wrap width, in
  // which case the wrap is incidental and the next line is the same paragraph.
  if (SENTENCE_END.test(trimmedCurrent)) return false

  // No terminal punctuation and the line reaches the wrap width: hard wrap.
  if (wrapWidth !== null && current.length >= wrapWidth - 10) return true

  // The remaining rules infer wrapping from prose conventions. Terminal and log
  // output does not follow them — each line is an independent record, and
  // gluing two together produces sentences that were never written.
  if (sourceKind === 'terminal' || sourceKind === 'log') return false

  // No wrap width detected, but the line is long and unterminated. Still a
  // continuation — prose does not normally end without punctuation.
  if (wrapWidth === null && trimmedCurrent.length >= 60) return true

  // A lowercase start on the next line means it cannot be a new sentence.
  if (/^[a-z]/.test(trimmedNext)) return true

  return false
}

/**
 * Joins hard-wrapped lines back into paragraphs, marking only genuine paragraph
 * boundaries with `breakAfter`.
 */
export function reflow(text: string, sourceKind: SourceKind): ReflowLine[] {
  const rawLines = text.split('\n')
  const wrapWidth = detectWrapWidth(rawLines)

  const result: ReflowLine[] = []
  let buffer = ''
  let insideFence = false

  const flush = (hardBreak: boolean) => {
    if (buffer.trim().length > 0) {
      result.push({ text: buffer.trim(), hardBreak })
    }
    buffer = ''
  }

  for (let i = 0; i < rawLines.length; i += 1) {
    const line = rawLines[i]

    if (FENCE.test(line)) {
      flush(true)
      insideFence = !insideFence
      result.push({ text: line.trim(), hardBreak: true })
      continue
    }

    // Inside a fence every line is preserved verbatim; joining code would be
    // meaningless whether we end up reading it or skipping it.
    if (insideFence) {
      result.push({ text: line, hardBreak: false })
      continue
    }

    if (line.trim().length === 0) {
      flush(true)
      continue
    }

    buffer = buffer.length === 0 ? line : `${buffer} ${line.trim()}`

    const next = rawLines[i + 1]
    if (next === undefined) {
      flush(true)
      continue
    }

    if (next.trim().length === 0) continue

    if (!isWrapContinuation(line, next, wrapWidth, sourceKind)) {
      // Not a wrap, but no blank line either — these are adjacent lines, not
      // separate paragraphs. Only structure earns a hard break here.
      flush(isStructural(next))
    }
  }

  flush(true)
  return result
}
