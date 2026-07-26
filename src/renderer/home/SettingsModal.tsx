import { useEffect, useState } from 'react'
import type { CodePolicy, Settings } from '@/shared/types'
import type { Voice } from '@/main/services/elevenlabs'
import { ShortcutRecorder } from './ShortcutRecorder'
import { formatBytes } from './format'

interface Props {
  settings: Settings
  onClose: () => void
  onSaved: (settings: Settings) => void
}

const CODE_POLICIES: Array<{ value: CodePolicy; label: string; hint: string }> = [
  { value: 'announce', label: 'Announce', hint: '"Code block, 12 lines, skipped."' },
  { value: 'skip', label: 'Skip silently', hint: 'Code is dropped entirely.' },
  { value: 'read', label: 'Read aloud', hint: 'Every character is spoken.' },
]

const PAUSE_FIELDS: Array<{ key: keyof Settings['pauses']; label: string; hint: string }> = [
  { key: 'lineMs', label: 'Between lines', hint: 'Adjacent output lines, e.g. in a terminal' },
  { key: 'listItemMs', label: 'Between list items', hint: '' },
  { key: 'paragraphMs', label: 'Between paragraphs', hint: 'Where a blank line appeared' },
  { key: 'headingMs', label: 'Around headings', hint: '' },
  { key: 'sectionMs', label: 'Between sections', hint: 'At a horizontal rule' },
]

export function SettingsModal({ settings, onClose, onSaved }: Props) {
  const [draft, setDraft] = useState<Settings>(settings)
  const [apiKey, setApiKey] = useState('')
  const [hasKey, setHasKey] = useState(false)
  const [voices, setVoices] = useState<Voice[]>([])
  const [cacheSize, setCacheSize] = useState(0)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    void window.bell.hasApiKey().then(setHasKey)
    void window.bell.cacheSize().then(setCacheSize)
    void window.bell.listVoices().then(setVoices).catch(() => setVoices([]))
  }, [])

  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setDraft((previous) => ({ ...previous, [key]: value }))
  }

  const updatePause = (key: keyof Settings['pauses'], value: number) => {
    setDraft((previous) => ({ ...previous, pauses: { ...previous.pauses, [key]: value } }))
  }

  const save = async () => {
    if (apiKey.trim().length > 0) {
      const result = await window.bell.setApiKey(apiKey.trim())
      if (!result.ok) {
        setMessage(result.error ?? 'Could not save the API key.')
        return
      }
      setHasKey(true)
      setApiKey('')
    }

    const saved = await window.bell.saveSettings(draft)
    onSaved(saved)
    onClose()
  }

  return (
    <div className="modal__backdrop" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <header className="modal__header">
          <h2>Settings</h2>
          <button onClick={onClose} type="button">
            ✕
          </button>
        </header>

        <div className="modal__body">
          <section className="field">
            <label htmlFor="apiKey">ElevenLabs API key</label>
            <input
              id="apiKey"
              type="password"
              placeholder={hasKey ? '•••••••• (saved)' : 'Paste your key'}
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
            />
            <p className="field__hint">Stored in the macOS Keychain, never in plain text.</p>
          </section>

          <section className="field">
            <label htmlFor="voice">Voice</label>
            <select
              id="voice"
              value={draft.voiceId}
              onChange={(event) => update('voiceId', event.target.value)}
            >
              {voices.length === 0 && <option value={draft.voiceId}>Default voice</option>}
              {voices.map((voice) => (
                <option key={voice.voiceId} value={voice.voiceId}>
                  {voice.name}
                </option>
              ))}
            </select>
          </section>

          <section className="field">
            <label htmlFor="model">Model</label>
            <select
              id="model"
              value={draft.modelId}
              onChange={(event) => update('modelId', event.target.value)}
            >
              <option value="eleven_flash_v2_5">Flash v2.5 — fastest</option>
              <option value="eleven_turbo_v2_5">Turbo v2.5 — balanced</option>
              <option value="eleven_multilingual_v2">Multilingual v2 — best quality</option>
            </select>
          </section>

          <section className="field">
            <label htmlFor="speed">Speed — {draft.speed.toFixed(2)}×</label>
            <input
              id="speed"
              type="range"
              min={0.7}
              max={1.2}
              step={0.05}
              value={draft.speed}
              onChange={(event) => update('speed', Number(event.target.value))}
            />
          </section>

          <section className="field">
            <label>Read selection shortcut</label>
            <ShortcutRecorder
              value={draft.hotkey}
              onChange={(accelerator) => update('hotkey', accelerator)}
            />
            <p className="field__hint">
              Press the combination you want. A modifier is required — a bare key would be
              swallowed system-wide, so you could never type it anywhere else.
            </p>
          </section>

          <section className="field">
            <label>Code blocks</label>
            <div className="radios">
              {CODE_POLICIES.map((policy) => (
                <label key={policy.value} className="radio">
                  <input
                    type="radio"
                    name="codePolicy"
                    checked={draft.codePolicy === policy.value}
                    onChange={() => update('codePolicy', policy.value)}
                  />
                  <span>
                    {policy.label}
                    <em>{policy.hint}</em>
                  </span>
                </label>
              ))}
            </div>
          </section>

          <section className="field">
            <label>Pause lengths</label>
            {PAUSE_FIELDS.map((field) => (
              <div key={field.key} className="pause">
                <span className="pause__label">
                  {field.label}
                  {field.hint && <em>{field.hint}</em>}
                </span>
                <input
                  type="range"
                  min={0}
                  max={2000}
                  step={50}
                  value={draft.pauses[field.key]}
                  onChange={(event) => updatePause(field.key, Number(event.target.value))}
                />
                <span className="pause__value">{(draft.pauses[field.key] / 1000).toFixed(2)}s</span>
              </div>
            ))}
          </section>

          <section className="field">
            <label htmlFor="maxChars">Maximum selection — {draft.maxChars.toLocaleString()} characters</label>
            <input
              id="maxChars"
              type="range"
              min={500}
              max={20000}
              step={500}
              value={draft.maxChars}
              onChange={(event) => update('maxChars', Number(event.target.value))}
            />
          </section>

          <section className="field">
            <label className="radio">
              <input
                type="checkbox"
                checked={draft.showIndicator}
                onChange={(event) => update('showIndicator', event.target.checked)}
              />
              <span>
                Show the indicator
                <em>A small pill stays onscreen so you can see Bell is running.</em>
              </span>
            </label>

            <label className="radio">
              <input
                type="checkbox"
                checked={draft.launchAtLogin}
                onChange={(event) => update('launchAtLogin', event.target.checked)}
              />
              <span>
                Launch at login
                <em>Bell starts in the menu bar when you log in.</em>
              </span>
            </label>
          </section>

          <section className="field">
            <label>Audio cache — {formatBytes(cacheSize)}</label>
            <button
              className="button"
              type="button"
              onClick={async () => {
                await window.bell.clearCache()
                setCacheSize(await window.bell.cacheSize())
              }}
            >
              Clear cache
            </button>
            <p className="field__hint">Cached audio makes replays instant and free.</p>
          </section>

          {message && <p className="modal__error">{message}</p>}
        </div>

        <footer className="modal__footer">
          <button className="button" onClick={onClose} type="button">
            Cancel
          </button>
          <button className="button button--primary" onClick={() => void save()} type="button">
            Save
          </button>
        </footer>
      </div>
    </div>
  )
}
