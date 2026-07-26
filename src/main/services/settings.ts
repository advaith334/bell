import { app, safeStorage } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { Settings } from '@/shared/types'
import { DEFAULT_SETTINGS } from '@/shared/types'

/**
 * Settings live in a plain JSON file; the API key is encrypted separately with
 * Electron's safeStorage, which is backed by the macOS Keychain. Keeping the key
 * out of the JSON means the settings file can be read and edited freely.
 */

function settingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json')
}

function keyPath(): string {
  return path.join(app.getPath('userData'), 'apikey.bin')
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
 * Reads ELEVEN_LABS_API_KEY from a .env file next to the project, or from the
 * process environment. This is a convenience for development — a key saved
 * through Settings always wins, so the two cannot disagree confusingly.
 */
function apiKeyFromEnvironment(): string | null {
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

export function setApiKey(key: string): void {
  if (key.length === 0) {
    fs.rmSync(keyPath(), { force: true })
    return
  }

  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Secure storage is unavailable, so the API key cannot be saved.')
  }

  fs.writeFileSync(keyPath(), safeStorage.encryptString(key))
}

export function getApiKey(): string | null {
  try {
    return safeStorage.decryptString(fs.readFileSync(keyPath()))
  } catch {
    return apiKeyFromEnvironment()
  }
}

/** True when the key came from .env rather than Settings, so the UI can say so. */
export function apiKeyIsFromEnvironment(): boolean {
  return !fs.existsSync(keyPath()) && apiKeyFromEnvironment() !== null
}

export function hasApiKey(): boolean {
  return getApiKey() !== null
}
