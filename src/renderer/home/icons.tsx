/** Small inline glyphs. Inline rather than a font so they inherit currentColor. */

export function PlayIcon() {
  return (
    <svg viewBox="0 0 12 12" aria-hidden>
      <path d="M2.5 1.3a.6.6 0 0 1 .92-.5l6.3 4.2a.6.6 0 0 1 0 1l-6.3 4.2a.6.6 0 0 1-.92-.5V1.3Z" />
    </svg>
  )
}

export function StopIcon() {
  return (
    <svg viewBox="0 0 12 12" aria-hidden>
      <rect x="2.4" y="2.4" width="7.2" height="7.2" rx="1.6" />
    </svg>
  )
}

/**
 * The pilcrow itself. Rendered as the character rather than as a path so it
 * always matches the app's typeface, the way the icon does.
 */
export function PilcrowMark() {
  return (
    <span className="pilcrow-mark" aria-hidden>
      ¶
    </span>
  )
}

export function CloseIcon() {
  return (
    <svg viewBox="0 0 12 12" aria-hidden style={{ width: 10, height: 10 }}>
      <path
        d="M2.6 2.6l6.8 6.8M9.4 2.6l-6.8 6.8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  )
}
