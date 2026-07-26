/** Channel names shared by main, preload, and the renderers. */
export const IPC = {
  // Renderer -> main
  read: 'bell:read',
  stop: 'bell:stop',
  replay: 'bell:replay',
  listUtterances: 'bell:list-utterances',
  deleteUtterance: 'bell:delete-utterance',
  stats: 'bell:stats',
  topSources: 'bell:top-sources',
  getSettings: 'bell:get-settings',
  saveSettings: 'bell:save-settings',
  setApiKey: 'bell:set-api-key',
  hasApiKey: 'bell:has-api-key',
  listVoices: 'bell:list-voices',
  permissionStatus: 'bell:permission-status',
  requestPermission: 'bell:request-permission',
  cacheSize: 'bell:cache-size',
  clearCache: 'bell:clear-cache',
  openHome: 'bell:open-home',

  // Audio renderer -> main
  audioFinished: 'bell:audio-finished',
  audioError: 'bell:audio-error',

  // HUD -> main
  hudInteractive: 'bell:hud-interactive',

  // Main -> renderer
  status: 'bell:status',
  audioChunk: 'bell:audio-chunk',
  audioReset: 'bell:audio-reset',
  historyChanged: 'bell:history-changed',
  openSettings: 'bell:open-settings',
} as const
