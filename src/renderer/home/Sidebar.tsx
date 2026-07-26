import type { Stats, TopSource } from '@/shared/types'
import { formatCount, formatDuration } from './format'

/**
 * The aside: stat cards and top sources. Both track speech output rather than
 * dictation input, which is the whole inversion of the original Flow home page.
 */

export function StatCards({ stats }: { stats: Stats }) {
  const cards = [
    { label: 'Today', value: formatCount(stats.today), unit: 'words' },
    { label: 'This week', value: formatCount(stats.week), unit: 'words' },
    { label: 'Streak', value: `${stats.streakDays}`, unit: stats.streakDays === 1 ? 'day' : 'days' },
    { label: 'Listened', value: formatDuration(stats.listeningMs), unit: '' },
  ]

  return (
    <section className="card">
      <h2 className="card__title">Spoken aloud</h2>
      <dl className="stats">
        {cards.map((card) => (
          <div key={card.label} className="stat">
            <dt>{card.label}</dt>
            <dd>
              {card.value}
              {card.unit && <span className="stat__unit">{card.unit}</span>}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

export function TopSources({ sources }: { sources: TopSource[] }) {
  return (
    <section className="card">
      <h2 className="card__title">Top sources</h2>

      {sources.length === 0 ? (
        <p className="empty empty--small">No reads yet.</p>
      ) : (
        <ul className="sources">
          {sources.map((source) => (
            <li key={source.sourceApp} className="source">
              <div className="source__head">
                <span className="source__name">{source.sourceName}</span>
                <span className="source__share">{Math.round(source.share * 100)}%</span>
              </div>
              <div className="source__bar">
                <div className="source__fill" style={{ width: `${source.share * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
