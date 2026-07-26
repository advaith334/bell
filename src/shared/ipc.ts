/** Channel names shared by main, preload, and the renderers. */
export const IPC = {
  // Renderer -> main
  read: 'pilcrow:read',
  stop: 'pilcrow:stop',
  replay: 'pilcrow:replay',
  listUtterances: 'pilcrow:list-utterances',
  deleteUtterance: 'pilcrow:delete-utterance',
  stats: 'pilcrow:stats',
  topSources: 'pilcrow:top-sources',
  getSettings: 'pilcrow:get-settings',
  saveSettings: 'pilcrow:save-settings',
  setApiKey: 'pilcrow:set-api-key',
  hasApiKey: 'pilcrow:has-api-key',
  listVoices: 'pilcrow:list-voices',
  permissionStatus: 'pilcrow:permission-status',
  requestPermission: 'pilcrow:request-permission',
  cacheSize: 'pilcrow:cache-size',
  clearCache: 'pilcrow:clear-cache',
  openHome: 'pilcrow:open-home',

  // Audio renderer -> main
  audioFinished: 'pilcrow:audio-finished',
  audioError: 'pilcrow:audio-error',

  // HUD -> main
  hudInteractive: 'pilcrow:hud-interactive',

  // Main -> renderer
  status: 'pilcrow:status',
  audioChunk: 'pilcrow:audio-chunk',
  audioReset: 'pilcrow:audio-reset',
  historyChanged: 'pilcrow:history-changed',
  openSettings: 'pilcrow:open-settings',
} as const
