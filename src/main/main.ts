import { app, BrowserWindow, globalShortcut, ipcMain, Menu, Tray, nativeImage } from 'electron'
import path from 'node:path'
import { IPC } from '@/shared/ipc'
import { formatAccelerator } from '@/shared/shortcut'
import { buildApplicationMenu } from './menu'
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

// Without this the menu bar and About panel say "Electron" in development,
// because the name is read from the binary rather than package.json.
app.setName('Bell')

function scheduleHudHide(delay: number): void {
  if (hudTimer) clearTimeout(hudTimer)
  hudTimer = setTimeout(() => {
    windows.hideHud()
    hudTimer = null
  }, delay)
}

function onStatus(status: PlaybackStatus): void {
  windows.broadcast(IPC.status, status)

  if (hudTimer) {
    clearTimeout(hudTimer)
    hudTimer = null
  }

  // With the ambient indicator on, the pill never hides — it just returns to
  // its idle state, which is the point: Bell stays visibly available.
  const keepVisible = settings.load().showIndicator

  if (status.state === 'idle') {
    windows.broadcast(IPC.historyChanged)
    if (keepVisible) windows.showHud()
    else scheduleHudHide(HUD_LINGER_MS)
    return
  }

  windows.showHud()

  // An error still needs to clear itself; it falls back to idle, not hidden.
  if (status.state === 'error') {
    hudTimer = setTimeout(() => {
      windows.broadcast(IPC.status, { state: 'idle' } satisfies PlaybackStatus)
      if (!keepVisible) windows.hideHud()
      hudTimer = null
    }, HUD_ERROR_MS)
  }
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

function resetAudio(): void {
  windows.getAudio()?.webContents.send(IPC.audioReset)
}

function registerHotkey(accelerator: string): boolean {
  globalShortcut.unregisterAll()
  try {
    // reader.read() toggles: pressing again while speaking stops.
    return globalShortcut.register(accelerator, () => void reader.read())
  } catch {
    return false
  }
}

function assetPath(name: string): string {
  // Packaged builds get assets from extraResource; development reads the repo.
  return app.isPackaged
    ? path.join(process.resourcesPath, name)
    : path.join(app.getAppPath(), 'assets', name)
}

function openSettings(): void {
  windows.createHome().webContents.send(IPC.openSettings)
}

function buildTray(): void {
  const icon = nativeImage.createFromPath(assetPath('trayTemplate.png'))
  // A template image lets macOS invert the icon for dark mode and for the
  // highlighted state, which is what makes it look native rather than pasted on.
  icon.setTemplateImage(true)

  const config = settings.load()

  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon)
  if (icon.isEmpty()) tray.setTitle('Bell')
  tray.setToolTip(`Bell — press ${formatAccelerator(config.hotkey)} to read the selection`)

  const menu = Menu.buildFromTemplate([
    { label: 'Read Selection', accelerator: config.hotkey, click: () => void reader.read() },
    { label: 'Stop', click: () => reader.stop() },
    { type: 'separator' },
    { label: 'Bell Home', click: () => windows.createHome() },
    { label: 'Settings…', accelerator: 'Command+,', click: () => openSettings() },
    { type: 'separator' },
    { label: 'Quit Bell', accelerator: 'Command+Q', click: () => app.quit() },
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
    if (patch.launchAtLogin !== undefined) applyLoginItem(next.launchAtLogin)
    if (patch.showIndicator !== undefined) {
      if (next.showIndicator) windows.showHud()
      else windows.hideHud()
    }
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
  ipcMain.on(IPC.hudInteractive, (_event, interactive: boolean) => {
    windows.setHudInteractive(interactive)
  })
}

function applyLoginItem(enabled: boolean): void {
  // Unsigned development builds cannot register a login item, and macOS reports
  // that as a hard error. Skip when already in the desired state so a default
  // install never trips it, and treat failure as non-fatal.
  try {
    if (app.getLoginItemSettings().openAtLogin === enabled) return
    app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: true })
  } catch {
    // Surfaces in Settings as the toggle simply not sticking.
  }
}

app.whenReady().then(() => {
  db.open()
  reader.init({ onStatus, onAudio, onReset: resetAudio })

  const config = settings.load()

  registerIpc()
  buildApplicationMenu({
    openHome: () => windows.createHome(),
    openSettings,
    readSelection: () => void reader.read(),
    stop: () => reader.stop(),
  })

  windows.createAudio()
  windows.createHud()
  windows.createHome()
  buildTray()
  applyLoginItem(config.launchAtLogin)

  if (config.showIndicator) windows.showHud()

  console.log(`[bell] ready — hotkey ${config.hotkey}, accessibility ${selection.hasAccessibilityPermission()}`)
  if (!registerHotkey(config.hotkey)) {
    // Most often means another app already owns the combination.
    onStatus({
      state: 'error',
      error: `Could not register ${formatAccelerator(config.hotkey)}. Pick another in Settings.`,
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
  app.setAboutPanelOptions({
    applicationName: 'Bell',
    applicationVersion: app.getVersion(),
    copyright: 'Highlight anything and hear it read back.',
  })
  // Menu-bar first: the dock icon appears only while the Home window is open,
  // which windows.ts manages. Hiding it here avoids a dock flash at launch.
  app.dock?.hide()
}
