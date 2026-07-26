import { app, BrowserWindow, globalShortcut, ipcMain, Menu, Tray, nativeImage } from 'electron'
import { IPC } from '@/shared/ipc'
import type { PlaybackStatus, Settings } from '@/shared/types'
import * as db from './db'
import * as cache from './services/cache'
import * as settings from './services/settings'
import * as selection from './services/selection'
import * as reader from './services/reader'
import { listVoices } from './services/elevenlabs'
import * as windows from './windows'

/** How long the HUD lingers after playback ends. */
const HUD_LINGER_MS = 1200
/** How long an error stays on the HUD before it fades. */
const HUD_ERROR_MS = 3200

let tray: Tray | null = null
let hudTimer: NodeJS.Timeout | null = null

if (require('electron-squirrel-startup')) app.quit()

function scheduleHudHide(delay: number): void {
  if (hudTimer) clearTimeout(hudTimer)
  hudTimer = setTimeout(() => {
    windows.hideHud()
    hudTimer = null
  }, delay)
}

function onStatus(status: PlaybackStatus): void {
  windows.broadcast(IPC.status, status)

  if (status.state === 'idle') {
    scheduleHudHide(HUD_LINGER_MS)
    windows.broadcast(IPC.historyChanged)
    return
  }

  if (status.state === 'error') {
    windows.showHud()
    scheduleHudHide(HUD_ERROR_MS)
    return
  }

  if (hudTimer) {
    clearTimeout(hudTimer)
    hudTimer = null
  }
  windows.showHud()
}

function onAudio(utteranceId: string, chunkIndex: number, audio: Buffer, isLast: boolean): void {
  const window = windows.getAudio()
  if (!window) return

  window.webContents.send(IPC.audioChunk, {
    utteranceId,
    chunkIndex,
    // Buffer survives structured clone as a Uint8Array view, which is what the
    // renderer appends to the SourceBuffer.
    audio: audio.buffer.slice(audio.byteOffset, audio.byteOffset + audio.byteLength),
    isLast,
  })
}

function registerHotkey(accelerator: string): boolean {
  globalShortcut.unregisterAll()
  try {
    return globalShortcut.register(accelerator, () => {
      windows.getAudio()?.webContents.send(IPC.audioReset)
      void reader.read()
    })
  } catch {
    return false
  }
}

function buildTray(): void {
  // An empty image keeps the tray slot without shipping an icon asset; the
  // title text is what identifies it in the menu bar.
  tray = new Tray(nativeImage.createEmpty())
  tray.setTitle('🔔')
  tray.setToolTip('Bell')

  const menu = Menu.buildFromTemplate([
    { label: 'Read selection', click: () => void reader.read() },
    { label: 'Stop', click: () => reader.stop() },
    { type: 'separator' },
    { label: 'Open Bell', click: () => windows.createHome() },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ])
  tray.setContextMenu(menu)
}

function registerIpc(): void {
  ipcMain.handle(IPC.read, () => reader.read())
  ipcMain.handle(IPC.stop, () => reader.stop())
  ipcMain.handle(IPC.replay, (_event, id: string) => reader.replay(id))

  ipcMain.handle(
    IPC.listUtterances,
    (_event, options: { limit?: number; offset?: number; search?: string }) =>
      db.list(options?.limit ?? 50, options?.offset ?? 0, options?.search),
  )
  ipcMain.handle(IPC.deleteUtterance, (_event, id: string) => {
    db.remove(id)
    windows.broadcast(IPC.historyChanged)
  })
  ipcMain.handle(IPC.stats, () => db.stats())
  ipcMain.handle(IPC.topSources, () => db.topSources())

  ipcMain.handle(IPC.getSettings, () => settings.load())
  ipcMain.handle(IPC.saveSettings, (_event, patch: Partial<Settings>) => {
    const next = settings.save(patch)
    if (patch.hotkey) registerHotkey(next.hotkey)
    return next
  })
  ipcMain.handle(IPC.setApiKey, (_event, key: string) => {
    try {
      settings.setApiKey(key)
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  })
  ipcMain.handle(IPC.hasApiKey, () => settings.hasApiKey())
  ipcMain.handle(IPC.listVoices, () => {
    const key = settings.getApiKey()
    return key ? listVoices(key) : []
  })

  ipcMain.handle(IPC.permissionStatus, () => selection.hasAccessibilityPermission())
  ipcMain.handle(IPC.requestPermission, () => selection.requestAccessibilityPermission())

  ipcMain.handle(IPC.cacheSize, () => cache.size())
  ipcMain.handle(IPC.clearCache, () => cache.clear())
  ipcMain.handle(IPC.openHome, () => windows.createHome())

  ipcMain.on(IPC.audioFinished, (_event, utteranceId: string) => {
    reader.markFinished(utteranceId)
  })
  ipcMain.on(IPC.audioError, (_event, message: string) => {
    onStatus({ state: 'error', error: message })
  })
}

app.whenReady().then(() => {
  db.open()
  reader.init({ onStatus, onAudio })

  registerIpc()
  windows.createAudio()
  windows.createHud()
  windows.createHome()
  buildTray()

  const config = settings.load()
  console.log(`[bell] ready — hotkey ${config.hotkey}, accessibility ${selection.hasAccessibilityPermission()}`)
  if (!registerHotkey(config.hotkey)) {
    // Most often means another app already owns the combination.
    onStatus({
      state: 'error',
      error: `Could not register the ${config.hotkey} shortcut. Pick another in Settings.`,
    })
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 || !windows.getHome()) {
      windows.createHome()
    }
  })
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

// Bell is a menu-bar app: closing the Home window should not quit it.
app.on('window-all-closed', () => {
  // Intentionally empty on every platform we ship.
})

if (process.platform === 'darwin') {
  app.setAboutPanelOptions({ applicationName: 'Bell', applicationVersion: app.getVersion() })
}
