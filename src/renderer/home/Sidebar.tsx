import { useEffect, useRef, useState } from 'react'
import type { Stats, TopSource } from '@/shared/types'
import { formatCount, formatDuration } from './format'

/**
 * The aside: stat cards and top sources. Both track speech output rather than
 * dictation input, which is the whole inversion of Flow's home page.
 */

const COUNT_UP_MS = 620

/**
 * Counts a number up on change. Applied only to word counts — a duration or a
 * streak counting up reads as a glitch rather than as motion.
 */
function useCountUp(target: number): number {
  const [value, setValue] = useState(target)
  const fromRef = useRef(target)

  useEffect(() => {
    const from = fromRef.current
    if (from === target) return

    // Skip the animation for large jumps (first load), which would otherwise
    // spin through thousands of numbers.
    if (Math.abs(target - from) > 5000 || from === 0) {
      fromRef.current = target
      setValue(target)
      return
    }

    let frame = 0
    const start = performance.now()

    const tick = (now: number) => {
      const progress = Math.min((now - start) / COUNT_UP_MS, 1)
      // easeOutCubic — fast then settling, matching the spring elsewhere.
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(Math.round(from + (target - from) * eased))
      if (progress < 1) frame = requestAnimationFrame(tick)
      else fromRef.current = target
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target])

  return value
}

function WordStat({ label, value }: { label: string; value: number }) {
  const animated = useCountUp(value)
  return (
    <div className="stat">
      <dt>{label}</dt>
      <dd>
        {formatCount(animated)}
        <span className="stat__unit">words</span>
      </dd>
    </div>
  )
}

export function StatCards({ stats }: { stats: Stats }) {
  return (
    <section className="card">
      <h2 className="card__title">Spoken aloud</h2>
      <dl className="stats">
        <WordStat label="Today" value={stats.today} />
        <WordStat label="This week" value={stats.week} />
        <div className="stat">
          <dt>Streak</dt>
          <dd>
            {stats.streakDays}
            <span className="stat__unit">{stats.streakDays === 1 ? 'day' : 'days'}</span>
          </dd>
        </div>
        <div className="stat">
          <dt>Listened</dt>
          <dd>{formatDuration(stats.listeningMs)}</dd>
        </div>
      </dl>
    </section>
  )
}

export function TopSources({ sources }: { sources: TopSource[] }) {
  return (
    <section className="card">
      <h2 className="card__title">Top sources</h2>

      {sources.length === 0 ? (
        <p className="empty empty--small">Nothing read yet.</p>
      ) : (
        <ul className="sources">
          {sources.map((source, index) => (
            <li key={source.sourceApp} className="source">
              <div className="source__head">
                <span className="source__name">{source.sourceName}</span>
                <span className="source__share">{Math.round(source.share * 100)}%</span>
              </div>
              <div className="source__bar">
                <div
                  className="source__fill"
                  style={{
                    width: `${Math.max(source.share * 100, 2)}%`,
                    animationDelay: `${index * 70}ms`,
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
