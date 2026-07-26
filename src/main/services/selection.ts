import { app, systemPreferences } from 'electron'
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import type { CaptureMethod, Selection } from '@/shared/types'

/**
 * Wraps the pilcrow-helper binary. The helper is spawned per capture rather than
 * kept alive: a capture is a rare, user-initiated event, and a short-lived
 * process cannot leak accessibility handles or wedge the app if it hangs.
 */

const HELPER_TIMEOUT_MS = 2000

export class SelectionError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message)
    this.name = 'SelectionError'
  }
}

interface HelperResponse {
  ok: boolean
  text?: string
  method?: CaptureMethod
  sourceApp?: string
  sourceName?: string
  error?: string
}

function helperPath(): string {
  // Packaged builds get the binary from extraResource; development runs use the
  // build output in the repo.
  const packaged = path.join(process.resourcesPath, 'pilcrow-helper')
  if (app.isPackaged || fs.existsSync(packaged)) return packaged
  return path.join(app.getAppPath(), 'swift-helper', 'dist', 'pilcrow-helper')
}

export function hasAccessibilityPermission(): boolean {
  return systemPreferences.isTrustedAccessibilityClient(false)
}

/** Triggers the system permission prompt. */
export function requestAccessibilityPermission(): void {
  systemPreferences.isTrustedAccessibilityClient(true)
}

const FRIENDLY_ERRORS: Record<string, string> = {
  'accessibility-permission-denied':
    'Pilcrow needs Accessibility permission to read your selection.',
  'secure-input-active': "This app is in a secure input mode, so Pilcrow can't read from it.",
  'no-selection': 'Nothing is selected.',
}

export function capture(): Promise<Selection> {
  return new Promise((resolve, reject) => {
    execFile(
      helperPath(),
      ['get-selection'],
      { timeout: HELPER_TIMEOUT_MS },
      (error, stdout) => {
        const trimmed = stdout.trim()

        // The helper exits non-zero on failure but still prints JSON, so parse
        // before treating the error as fatal.
        let parsed: HelperResponse | null = null
        if (trimmed.length > 0) {
          try {
            parsed = JSON.parse(trimmed) as HelperResponse
          } catch {
            parsed = null
          }
        }

        if (parsed?.ok && parsed.text) {
          resolve({
            text: parsed.text,
            method: parsed.method ?? 'accessibility',
            sourceApp: parsed.sourceApp,
            sourceName: parsed.sourceName,
          })
          return
        }

        if (parsed?.error) {
          const code = parsed.error
          reject(new SelectionError(FRIENDLY_ERRORS[code] ?? code, code))
          return
        }

        if (error) {
          reject(new SelectionError(`Could not read the selection: ${error.message}`, 'helper-failed'))
          return
        }

        reject(new SelectionError('Nothing is selected.', 'no-selection'))
      },
    )
  })
}
