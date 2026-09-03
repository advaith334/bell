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
  listVoices: 'pilcrow:list-voices',

  // Account and billing
  signIn: 'pilcrow:sign-in',
  signOut: 'pilcrow:sign-out',
  getAccount: 'pilcrow:get-account',
  refreshAccount: 'pilcrow:refresh-account',
  openCheckout: 'pilcrow:open-checkout',
  openBillingPortal: 'pilcrow:open-billing-portal',
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
  account: 'pilcrow:account',
  /** Brings Home forward on the upgrade sheet, from the HUD or a blocked read. */
  showUpgrade: 'pilcrow:show-upgrade',
} as const
