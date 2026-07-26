import { formatAccelerator } from '../shortcut'

describe('formatAccelerator', () => {
  it('renders the default hotkey with the option glyph', () => {
    expect(formatAccelerator('Alt+`')).toBe('⌥`')
  })

  it('uses the macOS modifier order regardless of how it was written', () => {
    expect(formatAccelerator('Shift+Alt+Cmd+R')).toBe('⌥⇧⌘R')
  })

  it('maps CmdOrCtrl to the command glyph', () => {
    expect(formatAccelerator('CmdOrCtrl+,')).toBe('⌘,')
  })

  it('renders named keys as glyphs', () => {
    expect(formatAccelerator('Escape')).toBe('⎋')
    expect(formatAccelerator('CmdOrCtrl+Shift+Space')).toBe('⇧⌘␣')
  })

  it('uppercases letter keys', () => {
    expect(formatAccelerator('Alt+s')).toBe('⌥S')
  })

  it('does not duplicate a repeated modifier', () => {
    expect(formatAccelerator('Cmd+Command+K')).toBe('⌘K')
  })
})
