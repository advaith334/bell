import type { Block, PauseSettings } from '@/shared/types'

/**
 * ElevenLabs becomes unstable with long or numerous break tags. Anything longer
 * than this is clamped; anything beyond MAX_BREAKS_PER_REQUEST is dropped by the
 * chunker rather than sent.
 */
const MAX_BREAK_MS = 3000

export function breakTag(ms: number): string {
  const clamped = Math.min(Math.max(ms, 0), MAX_BREAK_MS)
  if (clamped < 50) return ''
  return `<break time="${(clamped / 1000).toFixed(2)}s" />`
}

/** How long a pause follows a block of the given kind. */
function pauseAfter(block: Block, next: Block | undefined, pauses: PauseSettings): number {
  if (!next) return 0

  // A heading coming up always earns its setup pause, blank line or not.
  if (next.kind === 'heading') return pauses.headingMs

  switch (block.kind) {
    case 'heading':
      return pauses.headingMs
    case 'section':
      return pauses.sectionMs
    case 'listItem':
      // Consecutive list items get the short beat; leaving the list gets a
      // full paragraph pause.
      return next.kind === 'listItem' ? pauses.listItemMs : pauses.paragraphMs
    case 'code':
      return pauses.paragraphMs
    case 'quote':
      return next.kind === 'quote' ? pauses.listItemMs : pauses.paragraphMs
    case 'paragraph':
    default:
      // Only a blank line in the source makes this a paragraph. Adjacent lines
      // — terminal output, addresses, wrapped fragments we declined to join —
      // get a short beat instead, which is what stops the line-by-line stutter.
      return block.hardBreak ? pauses.paragraphMs : pauses.lineMs
  }
}

/** Ensures each block ends with punctuation so the model does not run on. */
function terminate(text: string): string {
  if (text.length === 0) return text
  return /[.!?:;,]$/.test(text) ? text : `${text}.`
}

export interface RenderedBlock {
  text: string
  pauseMs: number
}

export function withPauses(blocks: Block[], pauses: PauseSettings): RenderedBlock[] {
  const meaningful = blocks.filter((block) => block.text.length > 0 || block.kind === 'section')

  return meaningful.map((block, index) => ({
    text: terminate(block.text),
    pauseMs: pauseAfter(block, meaningful[index + 1], pauses),
  }))
}

export function renderSsml(rendered: RenderedBlock[]): string {
  return rendered
    .map((block) => {
      const tag = breakTag(block.pauseMs)
      return tag ? `${block.text} ${tag}` : block.text
    })
    .join(' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export function renderPlain(rendered: RenderedBlock[]): string {
  return rendered
    .map((block) => block.text)
    .filter((text) => text.length > 0)
    .join('\n\n')
}
