import { createRoot } from 'react-dom/client'
import { useEffect, useState } from 'react'
import type { PlaybackStatus } from '@/shared/types'
import '../shared/global.d'
import './hud.css'

const LABELS: Record<PlaybackStatus['state'], string> = {
  idle: 'Done',
  capturing: 'Reading selection',
  thinking: 'Preparing',
  speaking: 'Speaking',
  paused: 'Paused',
  error: 'Something went wrong',
}

function Hud() {
  const [status, setStatus] = useState<PlaybackStatus>({ state: 'idle' })

  useEffect(() => window.bell.onStatus(setStatus), [])

  const isError = status.state === 'error'
  const isBusy = status.state === 'capturing' || status.state === 'thinking'

  return (
    <div className={`hud ${isError ? 'hud--error' : ''}`}>
      <div className={`hud__indicator ${status.state === 'speaking' ? 'hud__indicator--live' : ''}`}>
        {isBusy ? <span className="hud__spinner" /> : <span className="hud__dot" />}
      </div>

      <div className="hud__body">
        <div className="hud__label">{LABELS[status.state]}</div>
        <div className="hud__text">
          {isError ? status.error : (status.currentText ?? '')}
        </div>
      </div>

      {status.state === 'speaking' && (
        <button className="hud__stop" onClick={() => void window.bell.stop()} type="button">
          Stop
        </button>
      )}
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<Hud />)
