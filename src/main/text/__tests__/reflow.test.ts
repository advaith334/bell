import { detectWrapWidth, reflow } from '../reflow'
import { clean } from '../clean'

describe('detectWrapWidth', () => {
  it('finds the modal width of a hard-wrapped block', () => {
    const lines = [
      'a'.repeat(78),
      'b'.repeat(79),
      'c'.repeat(77),
      'd'.repeat(80),
      'short tail',
    ]
    expect(detectWrapWidth(lines)).toBe(80)
  })

  it('returns null when lines are not consistently wrapped', () => {
    expect(detectWrapWidth(['short', 'also short', 'tiny'])).toBeNull()
    expect(detectWrapWidth(['a'.repeat(45), 'b'.repeat(120), 'c'.repeat(70)])).toBeNull()
  })
})

describe('reflow', () => {
  it('joins hard-wrapped prose into one paragraph', () => {
    const input = [
      'The migration runs in three phases. The first phase backfills the new',
      'column without taking a lock, which lets us deploy it during business',
      'hours instead of waiting for a maintenance window.',
    ].join('\n')

    const lines = reflow(clean(input), 'prose')

    expect(lines).toHaveLength(1)
    expect(lines[0].text).toContain('backfills the new column without')
    expect(lines[0].text).not.toContain('\n')
  })

  it('keeps a blank line as a real paragraph break', () => {
    const input = 'First paragraph here.\n\nSecond paragraph here.'
    const lines = reflow(clean(input), 'prose')

    expect(lines).toHaveLength(2)
    expect(lines[0].hardBreak).toBe(true)
    expect(lines[1].text).toBe('Second paragraph here.')
  })

  it('does not join across a shell prompt in terminal output', () => {
    const input = ['$ git status', 'On branch main', '$ git log --oneline'].join('\n')
    const lines = reflow(clean(input), 'terminal')

    expect(lines.length).toBeGreaterThanOrEqual(2)
    expect(lines.some((line) => line.text.includes('git log'))).toBe(true)
    // The prompt line must not have been glued onto the previous output line.
    expect(lines.some((line) => line.text.includes('On branch main $ git log'))).toBe(false)
  })

  it('treats each list item as its own line', () => {
    const input = ['- first item', '- second item', '- third item'].join('\n')
    const lines = reflow(clean(input), 'markdown')

    expect(lines).toHaveLength(3)
  })

  it('joins a line ending in a conjunction', () => {
    const input = 'We shipped the feature and\nthen we watched the dashboards.'
    const lines = reflow(clean(input), 'prose')

    expect(lines).toHaveLength(1)
  })

  it('does not treat an abbreviation period as a sentence end', () => {
    const input = 'Several formats are supported, e.g.\nJSON, YAML, and TOML.'
    const lines = reflow(clean(input), 'prose')

    expect(lines).toHaveLength(1)
  })

  it('preserves code fence contents verbatim', () => {
    const input = ['```ts', 'const a = 1', 'const b = 2', '```'].join('\n')
    const lines = reflow(clean(input), 'markdown')

    expect(lines.map((line) => line.text)).toEqual(['```ts', 'const a = 1', 'const b = 2', '```'])
  })
})
