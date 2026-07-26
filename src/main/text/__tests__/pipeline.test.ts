import { normalize, normalizeToChunks } from '../pipeline'
import { detectSourceKind } from '../source'
import { clean } from '../clean'

describe('clean', () => {
  it('strips ANSI colour codes', () => {
    const input = '[32mpassing[0m 12 tests'
    expect(clean(input)).toBe('passing 12 tests')
  })

  it('decodes HTML entities and normalizes quotes', () => {
    expect(clean('&quot;hello&quot; &amp; goodbye')).toBe('"hello" & goodbye')
    expect(clean('“smart” — dash')).toBe('"smart" - dash')
  })

  it('keeps carriage-return progress bars from doubling up', () => {
    expect(clean('Downloading 10%\rDownloading 100%')).toBe('Downloading 100%')
  })
})

describe('detectSourceKind', () => {
  it('trusts the frontmost app for terminals', () => {
    expect(detectSourceKind('anything at all', 'com.apple.terminal')).toBe('terminal')
  })

  it('recognises log output', () => {
    const log = [
      '2024-01-02T10:00:00Z INFO starting server',
      '2024-01-02T10:00:01Z INFO listening on 3000',
      '2024-01-02T10:00:02Z WARN slow query',
    ].join('\n')
    expect(detectSourceKind(log)).toBe('log')
  })

  it('recognises markdown', () => {
    expect(detectSourceKind('# Title\n\n- one\n- two')).toBe('markdown')
  })

  it('falls back to prose', () => {
    expect(detectSourceKind('Just a normal sentence about nothing.')).toBe('prose')
  })
})

describe('normalize', () => {
  it('inserts a paragraph break between paragraphs but not between wrapped lines', () => {
    const input = [
      'The first paragraph is long enough that it wraps across more than one',
      'line in the source text, but it is still a single thought.',
      '',
      'The second paragraph starts here.',
    ].join('\n')

    const { ssml, plain } = normalize(input)

    // Exactly one break: between the two paragraphs.
    expect(ssml.match(/<break/g)).toHaveLength(1)
    expect(plain.split('\n\n')).toHaveLength(2)
    expect(plain).toContain('wraps across more than one line in the source')
  })

  it('gives headings a longer pause than list items', () => {
    const input = ['# Overview', '', '- alpha', '- beta', '', 'Closing thought.'].join('\n')
    const { ssml } = normalize(input)

    expect(ssml).toContain('<break time="1.00s" />')
    expect(ssml).toContain('<break time="0.35s" />')
  })

  it('announces code blocks instead of reading them', () => {
    const input = ['Here is the fix:', '', '```ts', 'const a = 1', 'const b = 2', '```'].join('\n')
    const { plain } = normalize(input)

    expect(plain).toContain('Code block, 2 lines, skipped.')
    expect(plain).not.toContain('const a = 1')
  })

  it('can read code when the policy says so', () => {
    const input = ['```ts', 'const a = 1', '```'].join('\n')
    const { plain } = normalize(input, { codePolicy: 'read' })

    expect(plain).toContain('const a = 1')
  })

  it('drops code entirely under the skip policy', () => {
    const input = ['Intro line.', '', '```', 'secret()', '```'].join('\n')
    const { plain } = normalize(input, { codePolicy: 'skip' })

    expect(plain).not.toContain('secret')
    expect(plain).not.toContain('Code block')
    expect(plain).toContain('Intro line.')
  })

  it('speaks links as domains and drops markdown syntax', () => {
    const input = 'See [the docs](https://example.com/a/b/c) for details.'
    const { plain } = normalize(input)

    expect(plain).toBe('See the docs for details.')
  })

  it('speaks a bare url as its domain', () => {
    const { plain } = normalize('Read https://docs.anthropic.com/some/deep/path now.')
    expect(plain).toContain('link to docs.anthropic.com')
  })

  it('expands abbreviations so they do not read as sentence ends', () => {
    const { plain } = normalize('Use a fast model, e.g. flash, for this.')
    expect(plain).toContain('for example, flash')
  })

  it('strips shell prompts and timestamps from terminal output', () => {
    const input = ['$ npm test', 'All tests passed'].join('\n')
    const { plain } = normalize(input, { sourceApp: 'com.apple.terminal' })

    expect(plain).not.toContain('$')
    expect(plain).toContain('npm test')
  })

  it('does not pause after every line of terminal output', () => {
    const input = [
      'The build completed successfully and produced three artifacts in the',
      'output directory, which are ready to be uploaded to the release page.',
    ].join('\n')

    const { ssml } = normalize(input, { sourceApp: 'com.apple.terminal' })

    expect(ssml.match(/<break/g)).toBeNull()
  })

  it('does not put a paragraph pause after every line of real terminal output', () => {
    // Regression: consecutive output lines are not paragraphs. Before the
    // hardBreak distinction each of these got a full 0.7s pause, which is the
    // line-by-line stutter the whole reflow stage exists to prevent.
    const input = [
      'vite v5.4.19 building for production...',
      'transforming...',
      '34 modules transformed.',
      'dist/index.html  0.46 kB',
      'built in 1.23s',
    ].join('\n')

    const { ssml } = normalize(input, { sourceApp: 'com.apple.terminal' })

    expect(ssml).not.toContain('0.70s')
    expect(ssml.match(/<break time="0\.15s"/g)).toHaveLength(4)
  })

  it('still gives a full pause where the source had a blank line', () => {
    const input = 'Command finished.\n\nHere is the summary.'
    const { ssml } = normalize(input, { sourceApp: 'com.apple.terminal' })

    expect(ssml).toContain('0.70s')
  })

  it('returns an empty result for whitespace-only input', () => {
    expect(normalize('   \n\n  ').wordCount).toBe(0)
  })

  it('counts words on spoken text, not the raw capture', () => {
    const input = ['Two words.', '', '```', 'a', 'b', 'c', '```'].join('\n')
    const { wordCount, plain } = normalize(input, { codePolicy: 'skip' })

    expect(plain).toBe('Two words.')
    expect(wordCount).toBe(2)
  })
})

describe('normalizeToChunks', () => {
  it('makes the first chunk small so playback starts quickly', () => {
    const sentence = 'This is a reasonably long sentence used to pad the input out. '
    const { chunks } = normalizeToChunks(sentence.repeat(40))

    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks[0].plain.length).toBeLessThan(400)
    expect(chunks[1].plain.length).toBeGreaterThan(chunks[0].plain.length)
  })

  it('never splits inside a break tag', () => {
    const input = Array.from({ length: 30 }, (_, i) => `Paragraph number ${i} of the document.`).join(
      '\n\n',
    )
    const { chunks } = normalizeToChunks(input)

    for (const c of chunks) {
      const opens = (c.ssml.match(/<break/g) ?? []).length
      const closes = (c.ssml.match(/\/>/g) ?? []).length
      expect(opens).toBe(closes)
    }
  })

  it('keeps plain text free of break tags', () => {
    const { chunks } = normalizeToChunks('First para.\n\nSecond para.\n\nThird para.')
    for (const c of chunks) {
      expect(c.plain).not.toContain('<break')
    }
  })

  it('produces no chunks for empty input', () => {
    expect(normalizeToChunks('').chunks).toHaveLength(0)
  })
})
