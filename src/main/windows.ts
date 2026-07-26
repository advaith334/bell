import { BrowserWindow, screen } from 'electron'
import path from 'node:path'

/**
 * Three windows: the Home page, a transparent HUD, and a hidden window whose
 * only job is to own an <audio> element. Audio lives in a renderer because
 * MediaSource — the thing that makes gapless streaming playback possible — has
 * no main-process equivalent.
 */

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined
declare const MAIN_WINDOW_VITE_NAME: string

const HUD_WIDTH = 460
const HUD_HEIGHT = 92
const HUD_BOTTOM_MARGIN = 80

let home: BrowserWindow | null = null
let hud: BrowserWindow | null = null
let audio: BrowserWindow | null = null

function preloadPath(): string {
  return path.join(__dirname, '../preload/index.js')
}

function loadRoute(window: BrowserWindow, route: 'home' | 'hud' | 'audio'): void {
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    window.loadURL(`${MAIN_WINDOW_VITE_DEV_SERVER_URL}/src/renderer/${route}/index.html`)
    return
  }
  window.loadFile(
    path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/src/renderer/${route}/index.html`),
  )
}

export function createHome(): BrowserWindow {
  if (home && !home.isDestroyed()) {
    home.show()
    home.focus()
    return home
  }

  home = new BrowserWindow({
    width: 1060,
    height: 760,
    minWidth: 720,
    minHeight: 520,
    title: 'Bell',
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0f1115',
    show: false,
    webPreferences: { preload: preloadPath() },
  })

  loadRoute(home, 'home')
  home.once('ready-to-show', () => home?.show())
  home.on('closed', () => {
    home = null
  })

  return home
}

export function createHud(): BrowserWindow {
  if (hud && !hud.isDestroyed()) return hud

  const { workArea } = screen.getPrimaryDisplay()

  hud = new BrowserWindow({
    width: HUD_WIDTH,
    height: HUD_HEIGHT,
    x: Math.round(workArea.x + (workArea.width - HUD_WIDTH) / 2),
    y: workArea.y + workArea.height - HUD_HEIGHT - HUD_BOTTOM_MARGIN,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    focusable: false,
    show: false,
    alwaysOnTop: true,
    hasShadow: false,
    webPreferences: { preload: preloadPath() },
  })

  // Visible on every space, and above full-screen apps, so reading works
  // wherever the user happens to be.
  hud.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  hud.setAlwaysOnTop(true, 'screen-saver')

  loadRoute(hud, 'hud')
  hud.on('closed', () => {
    hud = null
  })

  return hud
}

export function createAudio(): BrowserWindow {
  if (audio && !audio.isDestroyed()) return audio

  audio = new BrowserWindow({
    width: 320,
    height: 200,
    show: false,
    webPreferences: { preload: preloadPath() },
  })

  loadRoute(audio, 'audio')
  audio.on('closed', () => {
    audio = null
  })

  return audio
}

export function showHud(): void {
  const window = createHud()
  if (!window.isVisible()) window.showInactive()
}

export function hideHud(): void {
  if (hud && !hud.isDestroyed() && hud.isVisible()) hud.hide()
}

export function getHome(): BrowserWindow | null {
  return home && !home.isDestroyed() ? home : null
}

export function getHud(): BrowserWindow | null {
  return hud && !hud.isDestroyed() ? hud : null
}

export function getAudio(): BrowserWindow | null {
  return audio && !audio.isDestroyed() ? audio : null
}

export function broadcast(channel: string, payload?: unknown): void {
  for (const window of [home, hud, audio]) {
    if (window && !window.isDestroyed()) {
      window.webContents.send(channel, payload)
    }
  }
}
