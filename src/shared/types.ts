/** What kind of text we think we captured. Drives how aggressively we reflow. */
export type SourceKind = 'terminal' | 'log' | 'markdown' | 'code' | 'prose'

/** How the selection was obtained. */
export type CaptureMethod = 'accessibility' | 'clipboard'

export interface Selection {
  text: string
  method: CaptureMethod
  sourceApp?: string
  sourceName?: string
}

/** What to do when the selection contains a code block. */
export type CodePolicy = 'skip' | 'announce' | 'read'

export interface PauseSettings {
  /** Between adjacent output lines with no blank line between them. */
  lineMs: number
  listItemMs: number
  paragraphMs: number
  headingMs: number
  sectionMs: number
}

export const DEFAULT_PAUSES: PauseSettings = {
  lineMs: 150,
  listItemMs: 350,
  paragraphMs: 700,
  headingMs: 1000,
  sectionMs: 1200,
}

export interface NormalizeOptions {
  codePolicy: CodePolicy
  pauses: PauseSettings
  /** Bundle id of the frontmost app, used to detect terminals. */
  sourceApp?: string
}

export const DEFAULT_NORMALIZE_OPTIONS: NormalizeOptions = {
  codePolicy: 'announce',
  pauses: DEFAULT_PAUSES,
}

/** A semantic unit of the normalized text, before break tags are rendered in. */
export interface Block {
  kind: 'paragraph' | 'heading' | 'listItem' | 'code' | 'quote' | 'section'
  text: string
  /**
   * True when this block was followed by a blank line in the source. A false
   * value means the next block was simply the next line, which is spoken with a
   * much shorter beat.
   */
  hardBreak: boolean
}

export interface NormalizeResult {
  /** Text with `<break>` tags, sent to ElevenLabs. */
  ssml: string
  /** Text without break tags, shown in the UI and used for word counts. */
  plain: string
  blocks: Block[]
  sourceKind: SourceKind
  wordCount: number
}

export interface Utterance {
  id: string
  createdAt: number
  rawText: string
  spokenText: string
  wordCount: number
  durationMs: number | null
  completed: boolean
  sourceApp: string | null
  sourceName: string | null
  sourceKind: SourceKind
  voiceId: string
  modelId: string
  cacheKey: string | null
  charsBilled: number
}

export interface Stats {
  today: number
  week: number
  total: number
  streakDays: number
  listeningMs: number
}

export interface TopSource {
  sourceApp: string
  sourceName: string
  words: number
  share: number
}

export type PlaybackState = 'idle' | 'capturing' | 'thinking' | 'speaking' | 'paused' | 'error'

export interface PlaybackStatus {
  state: PlaybackState
  utteranceId?: string
  currentText?: string
  progress?: number
  error?: string
}

export interface Settings {
  voiceId: string
  modelId: string
  speed: number
  hotkey: string
  codePolicy: CodePolicy
  pauses: PauseSettings
  maxChars: number
  launchAtLogin: boolean
  /** Keep a small always-on indicator onscreen so Pilcrow is visibly running. */
  showIndicator: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  // "Rachel" — a stock ElevenLabs voice, so a fresh install can speak
  // immediately once a key is entered.
  voiceId: '21m00Tcm4TlvDq8ikWAM',
  modelId: 'eleven_flash_v2_5',
  speed: 1.0,
  hotkey: 'Alt+`',
  codePolicy: 'announce',
  pauses: DEFAULT_PAUSES,
  maxChars: 5000,
  launchAtLogin: false,
  showIndicator: true,
}
