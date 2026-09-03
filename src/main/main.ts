import { app, BrowserWindow, globalShortcut, ipcMain, Menu, Tray, nativeImage, shell } from 'electron'
import path from 'node:path'
import { IPC } from '@/shared/ipc'
import { formatAccelerator } from '@/shared/shortcut'
import { buildApplicationMenu } from './menu'
import { migrateFromPreviousName } from './migrate'
import type { AccountState, PlaybackStatus, Settings } from '@/shared/types'
import { BACKEND, DEEP_LINK_SCHEME } from '@/shared/config'
import * as db from './db'
import * as cache from './services/cache'
import * as settings from './services/settings'
import * as selection from './services/selection'
import * as reader from './services/reader'
import { listVoices } from './services/tts'
import * as auth from './services/auth'
import * as account from './services/account'
import * as updater from './services/updater'
import * as windows from './windows'

/** How long the HUD lingers after playback ends. */
const HUD_LINGER_MS = 1200
/** How long an error stays on the HUD before it fades. */
const HUD_ERROR_MS = 3200

let tray: Tray | null = null
let hudTimer: NodeJS.Timeout | null = null

if (require('electron-squirrel-startup')) app.quit()

/**
 * Deep links are how sign-in gets its authorization code back. macOS delivers
 * `pilcrow://` either to the running instance via `open-url`, or by launching a
 * second one — so a single-instance lock is not optional here: without it the
 * callback would arrive in a process that never started the sign-in.
 */
if (!app.requestSingleInstanceLock()) {
  app.quit()
}

// Without this the menu bar and About panel say "Electron" in development,
// because the name is read from the binary rather than package.json.
app.setName('Pilcrow')

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
  // its idle state, which is the point: Pilcrow stays visibly available.
  const keepVisible = settings.load().showIndicator

  if (status.state === 'idle') {
    windows.broadcast(IPC.historyChanged)
    if (keepVisible) windows.showHud()
    else scheduleHudHide(HUD_LINGER_MS)
    return
  }

  // Being blocked is actionable, so surface the thing that unblocks them rather
  // than leaving a pill that says "no" and a hotkey that appears to do nothing.
  if (status.state === 'needs-upgrade') {
    windows.createHome()
    windows.broadcast(IPC.showUpgrade)
  } else if (status.state === 'needs-auth') {
    windows.createHome()
  }

  windows.showHud()

  // An error, or a prompt, still needs to clear itself; both fall back to idle
  // rather than hidden.
  if (status.state === 'error' || status.state === 'needs-auth' || status.state === 'needs-upgrade') {
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
  if (icon.isEmpty()) tray.setTitle('Pilcrow')
  tray.setToolTip(`Pilcrow — press ${formatAccelerator(config.hotkey)} to read the selection`)

  const menu = Menu.buildFromTemplate([
    { label: 'Read Selection', accelerator: config.hotkey, click: () => void reader.read() },
    { label: 'Stop', click: () => reader.stop() },
    { type: 'separator' },
    { label: 'Pilcrow Home', click: () => windows.createHome() },
    { label: 'Settings…', accelerator: 'Command+,', click: () => openSettings() },
    { type: 'separator' },
    { label: 'Quit Pilcrow', accelerator: 'Command+Q', click: () => app.quit() },
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
  ipcMain.handle(IPC.listVoices, () => listVoices())

  ipcMain.handle(IPC.getAccount, () => account.current())
  ipcMain.handle(IPC.refreshAccount, async () => {
    await account.refresh()
    return account.current()
  })

  ipcMain.handle(IPC.signIn, async () => {
    try {
      await auth.signIn()
      await account.refresh()
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle(IPC.signOut, () => {
    auth.signOut()
    void auth.openSignOutPage()
    return { ok: true }
  })

  // Checkout and the billing portal both open in the system browser. Stripe
  // forbids its Checkout page in an embedded webview, and we build no billing
  // UI of our own at all.
  ipcMain.handle(IPC.openCheckout, async () => {
    try {
      await shell.openExternal(await account.checkoutUrl())
      void account.awaitUpgrade()
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle(IPC.openBillingPortal, async () => {
    try {
      await shell.openExternal(await account.portalUrl())
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
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

/**
 * In a packaged build macOS reads the scheme from CFBundleURLTypes in Info.plist
 * and this call merely confirms it. Unpackaged, the scheme would otherwise
 * register against the Electron binary rather than Pilcrow — passing execPath and
 * the entry script is the documented way to make `npm start` behave, though the
 * loopback redirect in services/auth.ts is what development actually relies on.
 */
function registerProtocol(): void {
  if (app.isPackaged) {
    app.setAsDefaultProtocolClient(DEEP_LINK_SCHEME)
    return
  }

  const entry = process.argv[1]
  if (entry) {
    app.setAsDefaultProtocolClient(DEEP_LINK_SCHEME, process.execPath, [path.resolve(entry)])
  }
}

function handleDeepLink(rawUrl: string): void {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return
  }

  if (url.protocol !== `${DEEP_LINK_SCHEME}:`) return

  // URL treats `pilcrow://auth/callback` as host "auth", path "/callback".
  const route = `${url.host}${url.pathname}`.replace(/\/$/, '')

  switch (route) {
    case 'auth/callback':
      void auth.handleCallback(url)
      break

    case 'billing/return':
    case 'billing/success':
      // Stripe's webhook can lag the redirect by seconds; poll until the
      // entitlement flips rather than making someone who just paid click again.
      windows.createHome()
      void account.awaitUpgrade()
      break

    default:
      windows.createHome()
  }
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
  // Must run before anything opens a file under userData.
  migrateFromPreviousName()
  db.open()
  reader.init({ onStatus, onAudio, onReset: resetAudio })

  const config = settings.load()

  registerProtocol()
  updater.init(BACKEND.updateFeedUrl)
  account.init()
  account.onChange((state: AccountState) => windows.broadcast(IPC.account, state))

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

  console.log(`[pilcrow] ready — hotkey ${config.hotkey}, accessibility ${selection.hasAccessibilityPermission()}`)
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

/**
 * The running-instance path. macOS delivers `pilcrow://` here rather than as an
 * argv entry, and this can fire before `whenReady`, so the handler must tolerate
 * being called with no windows open.
 */
app.on('open-url', (event, url) => {
  event.preventDefault()
  handleDeepLink(url)
})

/**
 * The cold-start and relaunch path. If macOS launched a second copy to deliver
 * the URL, the single-instance lock routes its argv here instead.
 */
app.on('second-instance', (_event, argv) => {
  const link = argv.find((argument) => argument.startsWith(`${DEEP_LINK_SCHEME}://`))
  if (link) handleDeepLink(link)
  else windows.createHome()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

// Pilcrow is a menu-bar app: closing the Home window should not quit it.
app.on('window-all-closed', () => {
  // Intentionally empty on every platform we ship.
})

if (process.platform === 'darwin') {
  app.setAboutPanelOptions({
    applicationName: 'Pilcrow',
    applicationVersion: app.getVersion(),
    copyright: 'Highlight anything and hear it read back.',
  })
  // Menu-bar first: the dock icon appears only while the Home window is open,
  // which windows.ts manages. Hiding it here avoids a dock flash at launch.
  app.dock?.hide()
}
