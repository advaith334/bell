import { app } from 'electron'
import type { AppUpdater } from 'electron-updater'

/**
 * Auto-update against the CloudFront feed in front of the releases bucket
 * (infra/modules/dist). electron-updater does the version comparison, download,
 * signature check and swap-on-quit; we only tell it where to look and when.
 *
 * It is deliberately quiet: Pilcrow lives in the menu bar and is usually invoked
 * mid-task, so a modal asking to restart would land at exactly the wrong moment.
 * Updates install on quit instead.
 */

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

let updater: AppUpdater | null = null

export function init(feedUrl: string): void {
  // An unpackaged build has no code signature to verify and no version to
  // compare, so electron-updater throws rather than no-opping.
  if (!app.isPackaged || !feedUrl) return

  // Required lazily: importing electron-updater in development pulls in native
  // paths that do not exist outside a packaged app.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { autoUpdater } = require('electron-updater') as typeof import('electron-updater')
  updater = autoUpdater

  autoUpdater.setFeedURL({ provider: 'generic', url: feedUrl })
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-downloaded', (info) => {
    console.log(`[pilcrow] update ${info.version} ready; installing on quit`)
  })

  autoUpdater.on('error', (error) => {
    // A failed update check must never be user-visible. The app works fine on
    // the version it already has.
    console.error('[pilcrow] update check failed:', error.message)
  })

  void check()
  setInterval(() => void check(), CHECK_INTERVAL_MS)
}

async function check(): Promise<void> {
  try {
    await updater?.checkForUpdates()
  } catch {
    // Handled by the error listener; swallowed here so it cannot reject unhandled.
  }
}
