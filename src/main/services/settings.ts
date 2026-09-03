import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { Settings } from '@/shared/types'
import { DEFAULT_SETTINGS } from '@/shared/types'

/**
 * Settings live in a plain JSON file, so it can be read and edited freely.
 *
 * There is no user-facing API key any more: Pilcrow supplies the voice, and the
 * ElevenLabs key lives in the backend. The one remnant is the .env escape hatch
 * below, which exists purely so the text pipeline can be developed against
 * ElevenLabs directly without a running backend or a signed-in session.
 */

function settingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json')
}

let cached: Settings | null = null

export function load(): Settings {
  if (cached) return cached

  try {
    const raw = fs.readFileSync(settingsPath(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<Settings>
    cached = {
      ...DEFAULT_SETTINGS,
      ...parsed,
      pauses: { ...DEFAULT_SETTINGS.pauses, ...parsed.pauses },
    }
  } catch {
    cached = { ...DEFAULT_SETTINGS }
  }

  return cached
}

export function save(patch: Partial<Settings>): Settings {
  const next: Settings = {
    ...load(),
    ...patch,
    pauses: { ...load().pauses, ...patch.pauses },
  }
  cached = next
  fs.writeFileSync(settingsPath(), JSON.stringify(next, null, 2))
  return next
}

/**
 * Reads ELEVEN_LABS_API_KEY from a .env file or the process environment.
 *
 * DEVELOPMENT ONLY — deliberately inert in a packaged build. It lets the text
 * pipeline be worked on against ElevenLabs directly, without a backend or an
 * account. Shipping it would be a second, parallel way to pay for the same thing
 * and a trivial way around the paywall.
 */
export function developerApiKey(): string | null {
  if (app.isPackaged) return null

  const fromProcess = process.env.ELEVEN_LABS_API_KEY?.trim()
  if (fromProcess) return fromProcess

  const candidates = [
    path.join(app.getAppPath(), '.env'),
    path.join(process.cwd(), '.env'),
    path.join(app.getPath('userData'), '.env'),
  ]

  for (const candidate of candidates) {
    let contents: string
    try {
      contents = fs.readFileSync(candidate, 'utf8')
    } catch {
      continue
    }

    for (const line of contents.split('\n')) {
      const match = line.match(/^\s*(?:export\s+)?ELEVEN_LABS_API_KEY\s*=\s*(.*)$/)
      if (!match) continue

      // Strip surrounding quotes and any trailing comment on an unquoted value.
      const raw = match[1].trim()
      const value = /^(['"])(.*)\1$/.test(raw)
        ? raw.slice(1, -1)
        : raw.replace(/\s+#.*$/, '').trim()

      if (value.length > 0) return value
    }
  }

  return null
}
