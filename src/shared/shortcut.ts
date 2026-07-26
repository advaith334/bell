/**
 * Electron accelerators are written in a cross-platform vocabulary ("Alt+`",
 * "CmdOrCtrl+Shift+R"), but macOS never shows them that way — it shows modifier
 * glyphs, in a fixed order, with no separators. This converts one to the other
 * for display only; the accelerator string itself must stay untouched or
 * globalShortcut will not recognise it.
 */

const MODIFIER_GLYPHS: Record<string, string> = {
  cmd: '⌘',
  command: '⌘',
  cmdorctrl: '⌘',
  commandorcontrol: '⌘',
  ctrl: '⌃',
  control: '⌃',
  alt: '⌥',
  option: '⌥',
  shift: '⇧',
  meta: '⌘',
  super: '⌘',
}

/** macOS renders modifiers in this order regardless of how they were typed. */
const GLYPH_ORDER = ['⌃', '⌥', '⇧', '⌘']

const KEY_GLYPHS: Record<string, string> = {
  escape: '⎋',
  esc: '⎋',
  tab: '⇥',
  space: '␣',
  backspace: '⌫',
  delete: '⌦',
  return: '↩',
  enter: '↩',
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
  plus: '+',
}

export function formatAccelerator(accelerator: string): string {
  const parts = accelerator.split('+').filter((part) => part.length > 0)

  const glyphs: string[] = []
  const keys: string[] = []

  for (const part of parts) {
    const glyph = MODIFIER_GLYPHS[part.toLowerCase()]
    if (glyph) {
      if (!glyphs.includes(glyph)) glyphs.push(glyph)
    } else {
      keys.push(KEY_GLYPHS[part.toLowerCase()] ?? part.toUpperCase())
    }
  }

  glyphs.sort((a, b) => GLYPH_ORDER.indexOf(a) - GLYPH_ORDER.indexOf(b))

  return [...glyphs, ...keys].join('')
}
