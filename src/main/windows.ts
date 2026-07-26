import { app, BrowserWindow, nativeTheme, screen } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Three windows: the Home page, a transparent HUD, and a hidden window whose
 * only job is to own an <audio> element. Audio lives in a renderer because
 * MediaSource — the thing that makes gapless streaming playback possible — has
 * no main-process equivalent.
 */

// Injected by Forge's Vite plugin, named after the renderer entry in
// forge.config.ts. They are absent in a packaged build, so every read goes
// through devServerUrl()/rendererName() rather than touching them directly —
// a bare reference to an undefined global throws a ReferenceError that would
// take down window creation before anything is visible.
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined
declare const MAIN_WINDOW_VITE_NAME: string | undefined

function devServerUrl(): string | null {
  return typeof MAIN_WINDOW_VITE_DEV_SERVER_URL === 'string'
    ? MAIN_WINDOW_VITE_DEV_SERVER_URL
    : null
}

function rendererName(): string {
  return typeof MAIN_WINDOW_VITE_NAME === 'string' ? MAIN_WINDOW_VITE_NAME : 'main_window'
}

// Sized for the pill at its widest (speaking, with a stop button), not for a
// dialog. The window is wider than the idle pill so it can grow without a
// resize; the surrounding area is click-through.
const HUD_WIDTH = 330
const HUD_HEIGHT = 44
const HUD_EDGE_MARGIN = 16
const HUD_BOTTOM_MARGIN = 52

let home: BrowserWindow | null = null
let hud: BrowserWindow | null = null
let audio: BrowserWindow | null = null

function preloadPath(): string {
  // main.js and preload.js are emitted side by side into .vite/build.
  return path.join(__dirname, 'preload.js')
}

function loadRoute(window: BrowserWindow, route: 'home' | 'hud' | 'audio'): void {
  const devUrl = devServerUrl()

  if (devUrl) {
    void window.loadURL(`${devUrl}/src/renderer/${route}/index.html`)
    return
  }

  void window.loadFile(
    path.join(__dirname, `../renderer/${rendererName()}/src/renderer/${route}/index.html`),
  )
}

interface Bounds {
  width: number
  height: number
  x?: number
  y?: number
}

const DEFAULT_BOUNDS: Bounds = { width: 1060, height: 760 }

function boundsPath(): string {
  return path.join(app.getPath('userData'), 'window-state.json')
}

/**
 * Restores the last window position, but only if it still lands on a display
 * that exists — otherwise unplugging a monitor strands the window offscreen.
 */
function loadBounds(): Bounds {
  let saved: Bounds
  try {
    saved = { ...DEFAULT_BOUNDS, ...(JSON.parse(fs.readFileSync(boundsPath(), 'utf8')) as Bounds) }
  } catch {
    return DEFAULT_BOUNDS
  }

  if (saved.x === undefined || saved.y === undefined) return saved

  const visible = screen.getAllDisplays().some((display) => {
    const { x, y, width, height } = display.workArea
    return (
      saved.x! >= x - 100 &&
      saved.y! >= y - 40 &&
      saved.x! < x + width &&
      saved.y! < y + height
    )
  })

  return visible ? saved : { width: saved.width, height: saved.height }
}

function saveBounds(window: BrowserWindow): void {
  if (window.isDestroyed() || window.isMinimized() || window.isFullScreen()) return
  try {
    fs.writeFileSync(boundsPath(), JSON.stringify(window.getNormalBounds()))
  } catch {
    // Losing window position is not worth surfacing to the user.
  }
}

/**
 * Bell lives in the menu bar, so the dock icon only appears while the Home
 * window is open. Without this the dock shows a permanently running app the
 * user has no window for.
 */
function syncDockVisibility(): void {
  const shouldShow = home !== null && !home.isDestroyed()
  if (shouldShow) {
    void app.dock?.show()
  } else {
    app.dock?.hide()
  }
}

export function createHome(): BrowserWindow {
  if (home && !home.isDestroyed()) {
    home.show()
    home.focus()
    return home
  }

  const bounds = loadBounds()

  home = new BrowserWindow({
    ...bounds,
    minWidth: 760,
    minHeight: 540,
    title: 'Bell',
    // Inset traffic lights over a vibrant background is the standard look for a
    // single-view Mac app with no toolbar.
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 20 },
    vibrancy: 'under-window',
    visualEffectState: 'active',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#00000000' : '#00000000',
    show: false,
    webPreferences: { preload: preloadPath() },
  })

  loadRoute(home, 'home')

  home.once('ready-to-show', () => {
    home?.show()
    syncDockVisibility()
  })

  home.on('resize', () => home && saveBounds(home))
  home.on('move', () => home && saveBounds(home))

  home.on('close', () => home && saveBounds(home))
  home.on('closed', () => {
    home = null
    syncDockVisibility()
  })

  return home
}

export function createHud(): BrowserWindow {
  if (hud && !hud.isDestroyed()) return hud

  const { workArea } = screen.getPrimaryDisplay()

  hud = new BrowserWindow({
    width: HUD_WIDTH,
    height: HUD_HEIGHT,
    // Bottom-right, out of the way of window content and the dock's centre.
    x: workArea.x + workArea.width - HUD_WIDTH - HUD_EDGE_MARGIN,
    y: workArea.y + workArea.height - HUD_HEIGHT - HUD_BOTTOM_MARGIN,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    closable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: false,
    show: false,
    alwaysOnTop: true,
    hasShadow: false,
    // The card draws its own corners; native rounding would clip the shadow.
    roundedCorners: false,
    // A panel floats over full-screen apps in a way a normal window cannot.
    type: 'panel',
    hiddenInMissionControl: true,
    webPreferences: {
      preload: preloadPath(),
      // The indicator animates while unfocused, so it must keep drawing.
      backgroundThrottling: false,
    },
  })

  // Visible on every space and above full-screen apps, so the indicator is
  // present wherever the user happens to be reading.
  // skipTransformProcessType matters for a menu-bar app: without it, showing
  // this window flips the activation policy and makes a dock icon flash.
  hud.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true,
    skipTransformProcessType: true,
  })
  hud.setAlwaysOnTop(true, 'screen-saver')
  hud.setFullScreenable(false)

  // The window is a transparent rectangle much larger than the visible card, so
  // it starts click-through. The renderer re-enables mouse events only while the
  // pointer is genuinely over the card.
  hud.setIgnoreMouseEvents(true, { forward: true })

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

export function setHudInteractive(interactive: boolean): void {
  if (!hud || hud.isDestroyed()) return
  hud.setIgnoreMouseEvents(!interactive, { forward: true })
}

export function showHud(): void {
  const window = createHud()
  // showInactive keeps focus in whatever app the user was reading from.
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
