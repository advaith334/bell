import { useEffect, useRef, useState } from 'react'
import { formatAccelerator } from '@/shared/shortcut'

/**
 * Captures a real key press and converts it to an Electron accelerator, so the
 * user never has to know that "⌥" is spelled "Alt" in a config file.
 */

interface Props {
  value: string
  onChange: (accelerator: string) => void
}

/** event.code -> the token Electron expects. */
function keyToken(event: KeyboardEvent): string | null {
  const { code, key } = event

  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)
  if (code.startsWith('Numpad')) return `num${code.slice(6).toLowerCase()}`
  if (/^F\d{1,2}$/.test(code)) return code

  const byCode: Record<string, string> = {
    Backquote: '`',
    Minus: '-',
    Equal: '=',
    BracketLeft: '[',
    BracketRight: ']',
    Backslash: '\\',
    Semicolon: ';',
    Quote: "'",
    Comma: ',',
    Period: '.',
    Slash: '/',
    Space: 'Space',
    Enter: 'Return',
    Tab: 'Tab',
    Backspace: 'Backspace',
    Delete: 'Delete',
    Escape: 'Escape',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
  }

  if (byCode[code]) return byCode[code]
  if (key.length === 1) return key.toUpperCase()

  return null
}

const MODIFIER_CODES = ['Meta', 'Alt', 'Shift', 'Control']

export function ShortcutRecorder({ value, onChange }: Props) {
  const [recording, setRecording] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!recording) return

    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault()
      event.stopPropagation()

      if (event.key === 'Escape' && !event.metaKey && !event.altKey && !event.ctrlKey) {
        setRecording(false)
        setError(null)
        return
      }

      // Ignore a modifier pressed on its own — wait for the real key.
      if (MODIFIER_CODES.some((modifier) => event.key === modifier)) return

      const modifiers: string[] = []
      if (event.ctrlKey) modifiers.push('Control')
      if (event.altKey) modifiers.push('Alt')
      if (event.shiftKey) modifiers.push('Shift')
      if (event.metaKey) modifiers.push('Command')

      const token = keyToken(event)
      if (!token) {
        setError('That key cannot be used.')
        return
      }

      // A bare key would be swallowed system-wide, so the user could never type
      // it again anywhere. Function keys are the one safe exception.
      if (modifiers.length === 0 && !/^F\d{1,2}$/.test(token)) {
        setError('Add a modifier — ⌥, ⌘, ⌃ or ⇧.')
        return
      }

      onChange([...modifiers, token].join('+'))
      setError(null)
      setRecording(false)
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [recording, onChange])

  return (
    <div className="recorder">
      <button
        ref={buttonRef}
        type="button"
        className={`recorder__button ${recording ? 'recorder__button--recording' : ''}`}
        onClick={() => {
          setRecording((active) => !active)
          setError(null)
        }}
        onBlur={() => setRecording(false)}
      >
        {recording ? 'Press a key combination…' : <kbd className="kbd">{formatAccelerator(value)}</kbd>}
      </button>

      {recording && <span className="recorder__hint">esc to cancel</span>}
      {error && <span className="recorder__error">{error}</span>}
    </div>
  )
}
