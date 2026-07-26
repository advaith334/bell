import he from 'he'

// Matches ANSI CSI/OSC escape sequences. Inlined rather than pulling in
// `ansi-regex`, which is pure ESM and would force the whole main bundle
// through an ESM transform for one regex.
const ANSI_PATTERN = new RegExp(
  [
    '[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:[a-zA-Z\\d]*(?:;[-a-zA-Z\\d/#&.:=?%@~_]*)*)?\\u0007)',
    '(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-nq-uy=><~]))',
  ].join('|'),
  'g',
)

/** Box-drawing and block characters, common in terminal UIs and tables. */
const BOX_DRAWING = /[─-╿▀-▟]/g

/** Zero-width and bidi control characters. */
const INVISIBLE = /[​-‏‪-‮⁠﻿]/g

const SMART_QUOTE_MAP: Record<string, string> = {
  '‘': "'",
  '’': "'",
  '‚': "'",
  '“': '"',
  '”': '"',
  '„': '"',
  '′': "'",
  '″': '"',
}

/**
 * Strips escape codes, decodes entities, and folds typographic variants down to
 * ASCII equivalents. Deliberately preserves line structure — reflow happens
 * later and needs the original newlines.
 */
export function clean(input: string): string {
  let text = input.replace(ANSI_PATTERN, '')

  // Carriage returns from terminal progress bars leave overwritten fragments;
  // keep only what survived on each line.
  text = text.replace(/\r\n/g, '\n').replace(/^.*\r(?!\n)/gm, '')

  text = text.replace(INVISIBLE, '')
  text = text.replace(BOX_DRAWING, ' ')

  // Entity decoding can surface new markup-ish text, but decoding once is
  // enough for real-world input and avoids unbounded work on hostile strings.
  if (text.includes('&')) {
    text = he.decode(text)
  }

  text = text.normalize('NFC')
  text = text.replace(/[‘’‚“”„′″]/g, (c) => SMART_QUOTE_MAP[c] ?? c)
  text = text.replace(/[–—]/g, '-')
  text = text.replace(/…/g, '...')

  // Non-breaking and exotic spaces to plain spaces.
  text = text.replace(/[  -   　]/g, ' ')

  // Trailing whitespace per line, and tabs to spaces, so downstream indentation
  // checks are consistent.
  text = text.replace(/\t/g, '    ')
  text = text
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''))
    .join('\n')

  // Collapse runs of 3+ blank lines to a single paragraph break.
  text = text.replace(/\n{3,}/g, '\n\n')

  return text.trim()
}
