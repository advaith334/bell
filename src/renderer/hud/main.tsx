import { createRoot } from 'react-dom/client'
import { useEffect, useState } from 'react'
import type { PlaybackStatus } from '@/shared/types'
import { formatAccelerator } from '@/shared/shortcut'
import '../shared/global.d'
import './hud.css'

/**
 * A small always-present pill, not a dialog. Idle it is a dim dot that says
 * "Bell is running"; speaking it grows just enough to hold a level meter and a
 * stop button. It must never be large enough to feel like an interruption.
 */

const BAR_COUNT = 4

function Bars() {
  return (
    <span className="pill__bars" aria-hidden>
      {Array.from({ length: BAR_COUNT }, (_, index) => (
        <i key={index} style={{ animationDelay: `${index * 0.13}s` }} />
      ))}
    </span>
  )
}

function Pill() {
  const [status, setStatus] = useState<PlaybackStatus>({ state: 'idle' })
  const [hotkey, setHotkey] = useState('Alt+`')
  const [hovered, setHovered] = useState(false)

  useEffect(() => window.bell.onStatus(setStatus), [])

  useEffect(() => {
    void window.bell.getSettings().then((settings) => setHotkey(settings.hotkey))
    return window.bell.onOpenSettings(() => undefined)
  }, [])

  const { state } = status
  const isBusy = state === 'capturing' || state === 'thinking'
  const isSpeaking = state === 'speaking'
  const isError = state === 'error'
  const isIdle = state === 'idle'

  const setInteractive = (interactive: boolean) => {
    setHovered(interactive)
    window.bell.setHudInteractive(interactive)
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
          if (isSpeaking || isBusy) void window.bell.stop()
          else void window.bell.read()
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
                  : `Bell · ${formatAccelerator(hotkey)}`}
          </span>
        )}

        {(isSpeaking || isBusy) && (
          <button
            className="pill__stop"
            type="button"
            title="Stop"
            onClick={(event) => {
              event.stopPropagation()
              void window.bell.stop()
            }}
          >
            ✕
          </button>
        )}
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<Pill />)
