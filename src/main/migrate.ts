import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

/**
 * The app was called "Bell" before it was called "Pilcrow". macOS derives the
 * userData directory from the product name, so the rename would otherwise
 * silently orphan every previous read, the saved API key, and all settings —
 * the app would look freshly installed.
 *
 * This copies rather than moves, so a downgrade still finds its data, and it
 * only runs when the new directory does not already exist.
 */

const PREVIOUS_APP_NAME = 'Bell'

/** Renamed alongside the app, so the old file has to be found under its old name. */
const RENAMED_FILES: Record<string, string> = {
  'bell.sqlite': 'pilcrow.sqlite',
  'bell.sqlite-wal': 'pilcrow.sqlite-wal',
  'bell.sqlite-shm': 'pilcrow.sqlite-shm',
}

const CARRIED_OVER = [
  'settings.json',
  // Pilcrow supplies the voice now, so this is dead weight for the app itself —
  // but carrying it means a downgrade to an older build still finds its key.
  'apikey.bin',
  // The Cognito refresh token. Losing it on a rename would silently sign
  // everyone out, which looks exactly like the app forgetting them.
  'tokens.bin',
  'window-state.json',
  ...Object.keys(RENAMED_FILES),
]

function previousUserDataPath(): string {
  // getPath('userData') is appData + the current product name, so swapping the
  // last segment gives the old location without hardcoding the platform layout.
  return path.join(app.getPath('appData'), PREVIOUS_APP_NAME)
}

function copyDirectory(from: string, to: string): void {
  fs.mkdirSync(to, { recursive: true })
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name)
    const destination = path.join(to, entry.name)
    if (entry.isDirectory()) copyDirectory(source, destination)
    else fs.copyFileSync(source, destination)
  }
}

export function migrateFromPreviousName(): void {
  const previous = previousUserDataPath()
  const current = app.getPath('userData')

  if (previous === current) return
  if (!fs.existsSync(previous)) return

  // Any of these existing means this install already has its own state; never
  // overwrite real data with a migration.
  const alreadyMigrated = CARRIED_OVER.some((name) =>
    fs.existsSync(path.join(current, RENAMED_FILES[name] ?? name)),
  )
  if (alreadyMigrated) return

  try {
    fs.mkdirSync(current, { recursive: true })

    for (const name of CARRIED_OVER) {
      const source = path.join(previous, name)
      if (!fs.existsSync(source)) continue
      fs.copyFileSync(source, path.join(current, RENAMED_FILES[name] ?? name))
    }

    // The audio cache is keyed by content, so it stays valid across the rename
    // and carrying it over keeps every past read instantly replayable.
    const cache = path.join(previous, 'tts-cache')
    if (fs.existsSync(cache)) copyDirectory(cache, path.join(current, 'tts-cache'))

    console.log(`[pilcrow] migrated data from ${previous}`)
  } catch (error) {
    // A failed migration must not stop the app from starting; the user just
    // sees an empty history rather than a crash.
    console.error('[pilcrow] could not migrate previous data:', error)
  }
}
