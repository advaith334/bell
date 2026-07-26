import { useState } from 'react'
import type { Utterance } from '@/shared/types'
import { dayLabel, formatCount, formatDuration, formatRelative } from './format'

interface Props {
  utterances: Utterance[]
  onReplay: (id: string) => void
  onDelete: (id: string) => void
  search: string
  onSearchChange: (value: string) => void
}

const SNIPPET_LENGTH = 140

function Row({
  utterance,
  onReplay,
  onDelete,
}: {
  utterance: Utterance
  onReplay: (id: string) => void
  onDelete: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)

  const needsTruncation = utterance.spokenText.length > SNIPPET_LENGTH
  const shown =
    expanded || !needsTruncation
      ? utterance.spokenText
      : `${utterance.spokenText.slice(0, SNIPPET_LENGTH).trimEnd()}…`

  return (
    <li className="row">
      <button
        className="row__play"
        onClick={() => onReplay(utterance.id)}
        title="Play again"
        type="button"
      >
        ▶
      </button>

      <div className="row__body">
        <p className={`row__text ${expanded ? 'row__text--expanded' : ''}`}>{shown}</p>

        <div className="row__meta">
          <span>{utterance.sourceName ?? 'Unknown app'}</span>
          <span>·</span>
          <span>{formatRelative(utterance.createdAt)}</span>
          <span>·</span>
          <span>{formatCount(utterance.wordCount)} words</span>
          {utterance.durationMs !== null && (
            <>
              <span>·</span>
              <span>{formatDuration(utterance.durationMs)}</span>
            </>
          )}
          {!utterance.completed && utterance.durationMs !== null && (
            <>
              <span>·</span>
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
        <button onClick={() => void navigator.clipboard.writeText(utterance.spokenText)} type="button">
          Copy
        </button>
        <button onClick={() => onDelete(utterance.id)} type="button">
          Delete
        </button>
      </div>
    </li>
  )
}

export function RecentlyRead({ utterances, onReplay, onDelete, search, onSearchChange }: Props) {
  const groups: Array<{ label: string; items: Utterance[] }> = []
  for (const utterance of utterances) {
    const label = dayLabel(utterance.createdAt)
    const last = groups[groups.length - 1]
    if (last && last.label === label) {
      last.items.push(utterance)
    } else {
      groups.push({ label, items: [utterance] })
    }
  }

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
        <p className="empty">
          {search
            ? 'Nothing matches that search.'
            : 'Highlight text anywhere and press your shortcut. What Bell reads shows up here.'}
        </p>
      ) : (
        groups.map((group) => (
          <div key={group.label} className="group">
            <h3 className="group__label">{group.label}</h3>
            <ul className="group__list">
              {group.items.map((utterance) => (
                <Row
                  key={utterance.id}
                  utterance={utterance}
                  onReplay={onReplay}
                  onDelete={onDelete}
                />
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  )
}
