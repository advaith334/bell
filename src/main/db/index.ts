import { app } from 'electron'
import Database from 'better-sqlite3'
import path from 'node:path'
import type { SourceKind, Stats, TopSource, Utterance } from '@/shared/types'

let db: Database.Database | null = null

const SCHEMA = `
CREATE TABLE IF NOT EXISTS utterances (
  id            TEXT PRIMARY KEY,
  created_at    INTEGER NOT NULL,
  raw_text      TEXT NOT NULL,
  spoken_text   TEXT NOT NULL,
  word_count    INTEGER NOT NULL,
  duration_ms   INTEGER,
  completed     INTEGER NOT NULL DEFAULT 0,
  source_app    TEXT,
  source_name   TEXT,
  source_kind   TEXT NOT NULL,
  voice_id      TEXT NOT NULL,
  model_id      TEXT NOT NULL,
  cache_key     TEXT,
  chars_billed  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_utterances_created ON utterances(created_at DESC);
`

export function open(): Database.Database {
  if (db) return db
  db = new Database(path.join(app.getPath('userData'), 'pilcrow.sqlite'))
  db.pragma('journal_mode = WAL')
  db.exec(SCHEMA)
  return db
}

interface Row {
  id: string
  created_at: number
  raw_text: string
  spoken_text: string
  word_count: number
  duration_ms: number | null
  completed: number
  source_app: string | null
  source_name: string | null
  source_kind: string
  voice_id: string
  model_id: string
  cache_key: string | null
  chars_billed: number
}

function toUtterance(row: Row): Utterance {
  return {
    id: row.id,
    createdAt: row.created_at,
    rawText: row.raw_text,
    spokenText: row.spoken_text,
    wordCount: row.word_count,
    durationMs: row.duration_ms,
    completed: row.completed === 1,
    sourceApp: row.source_app,
    sourceName: row.source_name,
    sourceKind: row.source_kind as SourceKind,
    voiceId: row.voice_id,
    modelId: row.model_id,
    cacheKey: row.cache_key,
    charsBilled: row.chars_billed,
  }
}

export function insert(utterance: Utterance): void {
  open()
    .prepare(
      `INSERT INTO utterances (
        id, created_at, raw_text, spoken_text, word_count, duration_ms, completed,
        source_app, source_name, source_kind, voice_id, model_id, cache_key, chars_billed
      ) VALUES (
        @id, @createdAt, @rawText, @spokenText, @wordCount, @durationMs, @completed,
        @sourceApp, @sourceName, @sourceKind, @voiceId, @modelId, @cacheKey, @charsBilled
      )`,
    )
    .run({ ...utterance, completed: utterance.completed ? 1 : 0 })
}

/** Called when playback ends, whether it finished or the user stopped it. */
export function finish(id: string, durationMs: number, completed: boolean): void {
  open()
    .prepare('UPDATE utterances SET duration_ms = ?, completed = ? WHERE id = ?')
    .run(durationMs, completed ? 1 : 0, id)
}

export function addCharsBilled(id: string, chars: number): void {
  open().prepare('UPDATE utterances SET chars_billed = chars_billed + ? WHERE id = ?').run(chars, id)
}

export function list(limit = 50, offset = 0, search?: string): Utterance[] {
  const database = open()

  if (search && search.trim().length > 0) {
    const term = `%${search.trim()}%`
    const rows = database
      .prepare(
        `SELECT * FROM utterances
         WHERE spoken_text LIKE ? OR source_name LIKE ?
         ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .all(term, term, limit, offset) as Row[]
    return rows.map(toUtterance)
  }

  const rows = database
    .prepare('SELECT * FROM utterances ORDER BY created_at DESC LIMIT ? OFFSET ?')
    .all(limit, offset) as Row[]
  return rows.map(toUtterance)
}

export function get(id: string): Utterance | null {
  const row = open().prepare('SELECT * FROM utterances WHERE id = ?').get(id) as Row | undefined
  return row ? toUtterance(row) : null
}

export function remove(id: string): void {
  open().prepare('DELETE FROM utterances WHERE id = ?').run(id)
}

function startOfTodayMs(): number {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
}

/**
 * Counts consecutive days ending today (or yesterday, so a streak survives
 * until the user's next active day) that have at least one utterance.
 */
function computeStreak(days: Set<string>): number {
  const dayKey = (date: Date) =>
    `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`

  const cursor = new Date()
  if (!days.has(dayKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1)
    if (!days.has(dayKey(cursor))) return 0
  }

  let streak = 0
  while (days.has(dayKey(cursor))) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

export function stats(): Stats {
  const database = open()
  const todayStart = startOfTodayMs()
  const weekStart = todayStart - 6 * 24 * 60 * 60 * 1000

  const sum = (since?: number) => {
    const row = (since === undefined
      ? database.prepare('SELECT COALESCE(SUM(word_count), 0) AS total FROM utterances').get()
      : database
          .prepare('SELECT COALESCE(SUM(word_count), 0) AS total FROM utterances WHERE created_at >= ?')
          .get(since)) as { total: number }
    return row.total
  }

  const listening = database
    .prepare('SELECT COALESCE(SUM(duration_ms), 0) AS total FROM utterances')
    .get() as { total: number }

  const dayRows = database
    .prepare('SELECT DISTINCT created_at FROM utterances')
    .all() as Array<{ created_at: number }>

  const days = new Set(
    dayRows.map(({ created_at: createdAt }) => {
      const date = new Date(createdAt)
      return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
    }),
  )

  return {
    today: sum(todayStart),
    week: sum(weekStart),
    total: sum(),
    streakDays: computeStreak(days),
    listeningMs: listening.total,
  }
}

export function topSources(limit = 5): TopSource[] {
  const rows = open()
    .prepare(
      `SELECT source_app, source_name, SUM(word_count) AS words
       FROM utterances
       WHERE source_app IS NOT NULL
       GROUP BY source_app
       ORDER BY words DESC
       LIMIT ?`,
    )
    .all(limit) as Array<{ source_app: string; source_name: string | null; words: number }>

  const total = rows.reduce((sum, row) => sum + row.words, 0)

  return rows.map((row) => ({
    sourceApp: row.source_app,
    sourceName: row.source_name ?? row.source_app,
    words: row.words,
    share: total > 0 ? row.words / total : 0,
  }))
}
