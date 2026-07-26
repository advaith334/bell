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
    const encrypted = fs.readFileSync(keyPath())
    return safeStorage.decryptString(encrypted)
  } catch {
    return null
  }
}

export function hasApiKey(): boolean {
  return getApiKey() !== null
}
