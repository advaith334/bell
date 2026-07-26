import { useState } from 'react'
import type { Utterance } from '@/shared/types'
import { dayLabel, formatCount, formatDuration, formatRelative } from './format'
import { PilcrowMark, PlayIcon, StopIcon } from './icons'

interface Props {
  utterances: Utterance[]
  playingId: string | null
  onReplay: (id: string) => void
  onStop: () => void
  onDelete: (id: string) => void
  search: string
  onSearchChange: (value: string) => void
}

const SNIPPET_LENGTH = 150

function Row({
  utterance,
  index,
  isPlaying,
  onReplay,
  onStop,
  onDelete,
}: {
  utterance: Utterance
  index: number
  isPlaying: boolean
  onReplay: (id: string) => void
  onStop: () => void
  onDelete: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)

  const needsTruncation = utterance.spokenText.length > SNIPPET_LENGTH
  const shown =
    expanded || !needsTruncation
      ? utterance.spokenText
      : `${utterance.spokenText.slice(0, SNIPPET_LENGTH).trimEnd()}…`

  const copy = async () => {
    await navigator.clipboard.writeText(utterance.spokenText)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }

  return (
    <li
      className={`row ${isPlaying ? 'row--playing' : ''}`}
      style={{ '--row-index': index } as React.CSSProperties}
    >
      <button
        className="row__play"
        onClick={() => (isPlaying ? onStop() : onReplay(utterance.id))}
        title={isPlaying ? 'Stop' : 'Play again'}
        type="button"
      >
        {isPlaying ? <StopIcon /> : <PlayIcon />}
      </button>

      <div className="row__body">
        <p className="row__text">{shown}</p>

        <div className="row__meta">
          <span>{utterance.sourceName ?? 'Unknown app'}</span>
          <span className="row__sep">·</span>
          <span>{formatRelative(utterance.createdAt)}</span>
          <span className="row__sep">·</span>
          <span>
            {formatCount(utterance.wordCount)} {utterance.wordCount === 1 ? 'word' : 'words'}
          </span>
          {utterance.durationMs !== null && (
            <>
              <span className="row__sep">·</span>
              <span>{formatDuration(utterance.durationMs)}</span>
            </>
          )}
          {!utterance.completed && utterance.durationMs !== null && (
            <>
              <span className="row__sep">·</span>
              <span className="row__flag">stopped early</span>
            </>
          )}
        </div>
      </div>

      <div className="row__actions">
        {needsTruncation && (
          <button onClick={() => setExpanded((value) => !value)} type="button">
            {expanded ? 'Less' : 'More'}
          </button>
        )}
        <button onClick={() => void copy()} type="button">
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button className="is-danger" onClick={() => onDelete(utterance.id)} type="button">
          Delete
        </button>
      </div>
    </li>
  )
}

export function RecentlyRead({
  utterances,
  playingId,
  onReplay,
  onStop,
  onDelete,
  search,
  onSearchChange,
}: Props) {
  const groups: Array<{ label: string; items: Utterance[] }> = []
  for (const utterance of utterances) {
    const label = dayLabel(utterance.createdAt)
    const last = groups[groups.length - 1]
    if (last && last.label === label) last.items.push(utterance)
    else groups.push({ label, items: [utterance] })
  }

  // A single counter across groups so the stagger reads as one continuous list.
  let rowIndex = -1

  return (
    <section className="panel">
      <header className="panel__header">
        <h2>Recently read</h2>
        <input
          className="panel__search"
          placeholder="Search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </header>

      {utterances.length === 0 ? (
        <div className="empty">
          <span className="empty__glyph">
            <PilcrowMark />
          </span>
          <p>
            {search
              ? 'Nothing matches that search.'
              : 'Highlight text anywhere and press your shortcut. Everything Pilcrow reads shows up here.'}
          </p>
        </div>
      ) : (
        groups.map((group) => (
          <div key={group.label} className="group">
            <h3 className="group__label">{group.label}</h3>
            <ul className="group__list">
              {group.items.map((utterance) => {
                rowIndex += 1
                return (
                  <Row
                    key={utterance.id}
                    utterance={utterance}
                    index={rowIndex}
                    isPlaying={playingId === utterance.id}
                    onReplay={onReplay}
                    onStop={onStop}
                    onDelete={onDelete}
                  />
                )
              })}
            </ul>
          </div>
        ))
      )}
    </section>
  )
}
