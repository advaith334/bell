import { createRoot } from 'react-dom/client'
import { useEffect, useState } from 'react'
import type { PlaybackStatus } from '@/shared/types'
import { formatAccelerator } from '@/shared/shortcut'
import { CloseIcon } from '../home/icons'
import '../shared/global.d'
import './hud.css'

/**
 * A small always-present pill, not a dialog. Idle it is a dim dot that says
 * "Pilcrow is running"; speaking it grows just enough to hold a level meter and a
 * stop button. It must never be large enough to feel like an interruption.
 */

/** Staggered durations keep the meter from looking like a metronome. */
const BARS = [
  { delay: 0, duration: 0.82 },
  { delay: 0.16, duration: 1.04 },
  { delay: 0.31, duration: 0.72 },
  { delay: 0.09, duration: 0.94 },
]

function Bars() {
  return (
    <span className="pill__bars" aria-hidden>
      {BARS.map((bar, index) => (
        <i
          key={index}
          style={{ animationDelay: `${bar.delay}s`, animationDuration: `${bar.duration}s` }}
        />
      ))}
    </span>
  )
}

function Pill() {
  const [status, setStatus] = useState<PlaybackStatus>({ state: 'idle' })
  const [hotkey, setHotkey] = useState('Alt+`')
  const [hovered, setHovered] = useState(false)

  useEffect(() => window.pilcrow.onStatus(setStatus), [])

  useEffect(() => {
    void window.pilcrow.getSettings().then((settings) => setHotkey(settings.hotkey))
    return window.pilcrow.onOpenSettings(() => undefined)
  }, [])

  const { state } = status
  const isBusy = state === 'capturing' || state === 'thinking'
  const isSpeaking = state === 'speaking'
  const isError = state === 'error'
  const isIdle = state === 'idle'

  const setInteractive = (interactive: boolean) => {
    setHovered(interactive)
    window.pilcrow.setHudInteractive(interactive)
  }

  return (
    <div className="hud">
      <div
        className={[
          'pill',
          isIdle && !hovered ? 'pill--idle' : '',
          isError ? 'pill--error' : '',
          isSpeaking ? 'pill--speaking' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onMouseEnter={() => setInteractive(true)}
        onMouseLeave={() => setInteractive(false)}
        onClick={() => {
          // Click is a toggle: start a read when idle, stop when speaking.
          if (isSpeaking || isBusy) void window.pilcrow.stop()
          else void window.pilcrow.read()
        }}
        title={isIdle ? `Press ${formatAccelerator(hotkey)} to read the selection` : undefined}
      >
        {isBusy && <span className="pill__spinner" />}
        {isSpeaking && <Bars />}
        {isIdle && <span className="pill__dot" />}
        {isError && <span className="pill__warn">!</span>}

        {/* Idle stays wordless until hovered, so it reads as ambient. */}
        {(hovered || !isIdle) && (
          <span className="pill__label">
            {isError
              ? status.error
              : isSpeaking
                ? 'Speaking'
                : isBusy
                  ? 'Preparing'
                  : `Pilcrow · ${formatAccelerator(hotkey)}`}
          </span>
        )}

        {(isSpeaking || isBusy) && (
          <button
            className="pill__stop"
            type="button"
            title="Stop"
            onClick={(event) => {
              event.stopPropagation()
              void window.pilcrow.stop()
            }}
          >
            <CloseIcon />
          </button>
        )}
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<Pill />)
