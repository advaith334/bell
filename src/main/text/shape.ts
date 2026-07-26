import type { Block, CodePolicy, SourceKind } from '@/shared/types'
import type { ReflowLine } from './reflow'

const LIST_ITEM = /^\s{0,6}(?:[-*+•]|\d+[.)])\s+/
const HEADING = /^\s{0,3}(#{1,6})\s+/
const QUOTE = /^\s{0,3}>+\s?/
const FENCE = /^\s{0,3}(?:```|~~~)/
const SECTION_RULE = /^\s{0,3}(?:[-*_]\s?){3,}$/

const ABBREVIATIONS: Array<[RegExp, string]> = [
  [/\be\.g\.\s*/gi, 'for example, '],
  [/\bi\.e\.\s*/gi, 'that is, '],
  [/\betc\./gi, 'et cetera'],
  [/\bvs\.?\b/gi, 'versus'],
  [/\bapprox\./gi, 'approximately'],
  [/\bw\/\b/gi, 'with'],
  [/\baka\b/gi, 'also known as'],
  [/&/g, ' and '],
]

/** Speak a link as its domain, never its full path. */
function speakUrl(url: string): string {
  try {
    const parsed = new URL(url)
    return `link to ${parsed.hostname.replace(/^www\./, '')}`
  } catch {
    return 'link'
  }
}

function stripInlineMarkdown(text: string): string {
  let result = text

  // Markdown links: keep the label, drop the target entirely.
  result = result.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  // Images: announce rather than read the alt text as if it were prose.
  result = result.replace(/!\[([^\]]*)\]\([^)]*\)/g, 'image')

  // Inline code: read the contents, but a long identifier-only span is noise.
  result = result.replace(/`([^`]+)`/g, (_match, code: string) =>
    code.length > 40 ? 'code' : code,
  )

  result = result.replace(/(\*\*|__)(.+?)\1/g, '$2')
  result = result.replace(/(\*|_)(.+?)\1/g, '$2')
  result = result.replace(/~~(.+?)~~/g, '$2')

  // Bare URLs.
  result = result.replace(/https?:\/\/\S+/g, (url) => speakUrl(url))

  // Long file paths: keep the basename, which is the part people recognise.
  result = result.replace(/(?:[\w.-]+\/){2,}([\w.-]+)/g, '$1')

  // Hashes and long digit runs read terribly character by character.
  result = result.replace(/\b[0-9a-f]{12,}\b/gi, 'hash')

  for (const [pattern, replacement] of ABBREVIATIONS) {
    result = result.replace(pattern, replacement)
  }

  return result.replace(/\s{2,}/g, ' ').trim()
}

function describeCode(lineCount: number, policy: CodePolicy): string | null {
  if (policy === 'skip') return null
  const plural = lineCount === 1 ? 'line' : 'lines'
  return `Code block, ${lineCount} ${plural}, skipped.`
}

/**
 * Turns reflowed lines into semantic blocks, applying the code policy and
 * cleaning inline markup as it goes.
 */
export function shape(
  lines: ReflowLine[],
  sourceKind: SourceKind,
  codePolicy: CodePolicy,
): Block[] {
  const blocks: Block[] = []
  let fenceBuffer: string[] | null = null

  const pushText = (kind: Block['kind'], raw: string, hardBreak: boolean) => {
    const text = stripInlineMarkdown(raw)
    if (text.length > 0) blocks.push({ kind, text, hardBreak })
  }

  const closeFence = (contents: string[]) => {
    if (codePolicy === 'read') {
      blocks.push({ kind: 'code', text: contents.join('. '), hardBreak: true })
      return
    }
    const description = describeCode(contents.length, codePolicy)
    if (description) blocks.push({ kind: 'code', text: description, hardBreak: true })
  }

  for (const line of lines) {
    const { text, hardBreak } = line

    if (FENCE.test(text)) {
      if (fenceBuffer === null) {
        fenceBuffer = []
      } else {
        closeFence(fenceBuffer)
        fenceBuffer = null
      }
      continue
    }

    if (fenceBuffer !== null) {
      fenceBuffer.push(text.trim())
      continue
    }

    if (SECTION_RULE.test(text)) {
      blocks.push({ kind: 'section', text: '', hardBreak: true })
      continue
    }

    if (HEADING.test(text)) {
      pushText('heading', text.replace(HEADING, ''), true)
      continue
    }

    if (QUOTE.test(text)) {
      pushText('quote', text.replace(QUOTE, ''), hardBreak)
      continue
    }

    if (LIST_ITEM.test(text)) {
      pushText('listItem', text.replace(LIST_ITEM, ''), hardBreak)
      continue
    }

    pushText('paragraph', text, hardBreak)
  }

  // An unterminated fence is common when someone highlights part of a document.
  if (fenceBuffer !== null && fenceBuffer.length > 0) {
    closeFence(fenceBuffer)
  }

  // Terminal and log output carries chrome that adds nothing when spoken.
  if (sourceKind === 'terminal' || sourceKind === 'log') {
    return blocks.map((block) => ({
      ...block,
      text: block.text
        .replace(/^\s*(?:[$%>❯➜]\s*|[\w.-]+@[\w.-]+[:\s]\S*[$%#]\s*)/, '')
        .replace(/^\s*(?:\[?\d{4}-\d{2}-\d{2}[T ]\S*|\[?\d{2}:\d{2}:\d{2}(?:\.\d+)?\]?)\s*/, '')
        .trim(),
    })).filter((block) => block.text.length > 0 || block.kind === 'section')
  }

  return blocks
}
