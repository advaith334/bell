import type { NormalizeOptions, NormalizeResult } from '@/shared/types'
import { DEFAULT_NORMALIZE_OPTIONS } from '@/shared/types'
import { clean } from './clean'
import { detectSourceKind } from './source'
import { reflow } from './reflow'
import { shape } from './shape'
import { renderPlain, renderSsml, withPauses, type RenderedBlock } from './pauses'
import { chunk, type Chunk } from './chunk'

export function countWords(text: string): number {
  const matches = text.trim().match(/\S+/g)
  return matches ? matches.length : 0
}

const EMPTY: NormalizeResult = {
  ssml: '',
  plain: '',
  blocks: [],
  sourceKind: 'prose',
  wordCount: 0,
}

/**
 * clean -> classify -> reflow -> shape -> pause.
 * Each stage is pure and independently tested; this just wires them together.
 */
function run(
  input: string,
  options: Partial<NormalizeOptions>,
): { result: NormalizeResult; rendered: RenderedBlock[] } {
  const resolved: NormalizeOptions = { ...DEFAULT_NORMALIZE_OPTIONS, ...options }

  const cleaned = clean(input)
  if (cleaned.length === 0) return { result: EMPTY, rendered: [] }

  const sourceKind = detectSourceKind(cleaned, resolved.sourceApp)
  const lines = reflow(cleaned, sourceKind)
  const blocks = shape(lines, sourceKind, resolved.codePolicy)
  const rendered = withPauses(blocks, resolved.pauses)
  const plain = renderPlain(rendered)

  return {
    result: {
      ssml: renderSsml(rendered),
      plain,
      blocks,
      sourceKind,
      wordCount: countWords(plain),
    },
    rendered,
  }
}

export function normalize(
  input: string,
  options: Partial<NormalizeOptions> = {},
): NormalizeResult {
  return run(input, options).result
}

export function normalizeToChunks(
  input: string,
  options: Partial<NormalizeOptions> = {},
): { result: NormalizeResult; chunks: Chunk[] } {
  const { result, rendered } = run(input, options)
  return { result, chunks: chunk(rendered) }
}

export type { Chunk }
