import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@/shared/ipc'
import type {
  PlaybackStatus,
  Settings,
  Stats,
  TopSource,
  Utterance,
} from '@/shared/types'
import type { Voice } from '@/main/services/elevenlabs'

const api = {
  read: () => ipcRenderer.invoke(IPC.read),
  stop: () => ipcRenderer.invoke(IPC.stop),
  replay: (id: string) => ipcRenderer.invoke(IPC.replay, id),

  listUtterances: (limit?: number, offset?: number, search?: string): Promise<Utterance[]> =>
    ipcRenderer.invoke(IPC.listUtterances, { limit, offset, search }),
  deleteUtterance: (id: string) => ipcRenderer.invoke(IPC.deleteUtterance, id),
  stats: (): Promise<Stats> => ipcRenderer.invoke(IPC.stats),
  topSources: (): Promise<TopSource[]> => ipcRenderer.invoke(IPC.topSources),

  getSettings: (): Promise<Settings> => ipcRenderer.invoke(IPC.getSettings),
  saveSettings: (patch: Partial<Settings>): Promise<Settings> =>
    ipcRenderer.invoke(IPC.saveSettings, patch),
  setApiKey: (key: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC.setApiKey, key),
  hasApiKey: (): Promise<boolean> => ipcRenderer.invoke(IPC.hasApiKey),
  listVoices: (): Promise<Voice[]> => ipcRenderer.invoke(IPC.listVoices),

  permissionStatus: (): Promise<boolean> => ipcRenderer.invoke(IPC.permissionStatus),
  requestPermission: () => ipcRenderer.invoke(IPC.requestPermission),

  cacheSize: (): Promise<number> => ipcRenderer.invoke(IPC.cacheSize),
  clearCache: () => ipcRenderer.invoke(IPC.clearCache),

  // These return a plain unsubscribe function so they can be used directly as
  // a React effect cleanup.
  onStatus: (handler: (status: PlaybackStatus) => void): (() => void) => {
    const listener = (_event: unknown, status: PlaybackStatus) => handler(status)
    ipcRenderer.on(IPC.status, listener)
    return () => {
      ipcRenderer.removeListener(IPC.status, listener)
    }
  },

  onHistoryChanged: (handler: () => void): (() => void) => {
    const listener = () => handler()
    ipcRenderer.on(IPC.historyChanged, listener)
    return () => {
      ipcRenderer.removeListener(IPC.historyChanged, listener)
    }
  },

  /** Fired by the Settings… menu item and Cmd+, */
  onOpenSettings: (handler: () => void): (() => void) => {
    const listener = () => handler()
    ipcRenderer.on(IPC.openSettings, listener)
    return () => {
      ipcRenderer.removeListener(IPC.openSettings, listener)
    }
  },

  /** The HUD reports pointer-over-card so main can toggle click-through. */
  setHudInteractive: (interactive: boolean) =>
    ipcRenderer.send(IPC.hudInteractive, interactive),
}

/** Only the hidden audio window uses this half of the bridge. */
const audioApi = {
  onChunk: (
    handler: (payload: {
      utteranceId: string
      chunkIndex: number
      audio: ArrayBuffer
      isLast: boolean
    }) => void,
  ) => {
    ipcRenderer.on(IPC.audioChunk, (_event, payload) => handler(payload))
  },
  onReset: (handler: () => void) => {
    ipcRenderer.on(IPC.audioReset, () => handler())
  },
  finished: (utteranceId: string) => ipcRenderer.send(IPC.audioFinished, utteranceId),
  error: (message: string) => ipcRenderer.send(IPC.audioError, message),
}

contextBridge.exposeInMainWorld('pilcrow', api)
contextBridge.exposeInMainWorld('pilcrowAudio', audioApi)

export type PilcrowApi = typeof api
export type PilcrowAudioApi = typeof audioApi
