import type { SourceKind } from '@/shared/types'

const TERMINAL_BUNDLE_IDS = [
  'com.apple.terminal',
  'com.googlecode.iterm2',
  'dev.warp.warp-stable',
  'dev.warp.warp',
  'co.zeit.hyper',
  'net.kovidgoyal.kitty',
  'com.github.wez.wezterm',
  'io.alacritty',
  'com.mitchellh.ghostty',
]

/** `12:04:33`, `2024-01-02T10:00:00Z`, `[INFO]`, `WARN`, `ERROR:` … */
const LOG_LINE =
  /^\s*(?:\[?\d{4}-\d{2}-\d{2}[T ]|\[?\d{2}:\d{2}:\d{2}|\[(?:INFO|WARN|WARNING|ERROR|DEBUG|TRACE|FATAL)\]|(?:INFO|WARN|WARNING|ERROR|DEBUG|TRACE|FATAL)\b[:\s])/i

/** `$ `, `% `, `> `, `➜ `, `user@host:~$` */
export const SHELL_PROMPT = /^\s*(?:[$%>❯➜]\s|[\w.-]+@[\w.-]+[:\s].*[$%#]\s)/

const MARKDOWN_MARKERS = [
  /^\s{0,3}#{1,6}\s+\S/m, // heading
  /^\s{0,3}(?:[-*+]|\d+\.)\s+\S/m, // list
  /^\s{0,3}```/m, // fence
  /^\s{0,3}>\s/m, // blockquote
  /\[[^\]]+\]\([^)]+\)/, // link
  /(?:\*\*|__)\S/, // bold
]

/** Lines that look like source code rather than prose. */
const CODE_LINE =
  /(?:^\s*(?:import|export|const|let|var|func|function|def|class|return|if|for|while|public|private|#include|package)\b|[;{}]\s*$|=>|::|\)\s*\{\s*$)/

function ratio(lines: string[], predicate: (line: string) => boolean): number {
  const meaningful = lines.filter((line) => line.trim().length > 0)
  if (meaningful.length === 0) return 0
  return meaningful.filter(predicate).length / meaningful.length
}

/**
 * Classifies a selection so later stages know how much structure to trust.
 * The frontmost app is the strongest signal available, so it wins outright.
 */
export function detectSourceKind(text: string, sourceApp?: string): SourceKind {
  if (sourceApp && TERMINAL_BUNDLE_IDS.includes(sourceApp.toLowerCase())) {
    return 'terminal'
  }

  const lines = text.split('\n')

  if (ratio(lines, (line) => LOG_LINE.test(line)) >= 0.3) return 'log'
  if (ratio(lines, (line) => SHELL_PROMPT.test(line)) >= 0.15) return 'terminal'

  const markdownHits = MARKDOWN_MARKERS.filter((pattern) => pattern.test(text)).length
  if (markdownHits >= 2) return 'markdown'

  if (ratio(lines, (line) => CODE_LINE.test(line)) >= 0.4) return 'code'

  // A single strong marker (heading or fence) is enough when nothing else fired.
  if (markdownHits >= 1 && /^\s{0,3}(?:#{1,6}\s|```)/m.test(text)) return 'markdown'

  return 'prose'
}
