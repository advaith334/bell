import { createRoot } from 'react-dom/client'
import { useCallback, useEffect, useState } from 'react'
import type { Settings, Stats, TopSource, Utterance } from '@/shared/types'
import { DEFAULT_SETTINGS } from '@/shared/types'
import { formatAccelerator } from '@/shared/shortcut'
import { RecentlyRead } from './RecentlyRead'
import { StatCards, TopSources } from './Sidebar'
import { SettingsModal } from './SettingsModal'
import { formatCount } from './format'
import '../shared/global.d'
import './home.css'

/** Below this, the header still teaches the shortcut. Mirrors Flow's Home. */
const SHORTCUT_HINT_THRESHOLD = 2000

const EMPTY_STATS: Stats = { today: 0, week: 0, total: 0, streakDays: 0, listeningMs: 0 }

function Header({
  total,
  hotkey,
  onOpenSettings,
}: {
  total: number
  hotkey: string
  onOpenSettings: () => void
}) {
  return (
    <header className="header">
      <div>
        <h1 className="header__title">
          {total >= SHORTCUT_HINT_THRESHOLD ? (
            <>Welcome back</>
          ) : (
            <>
              Highlight anything and press <kbd>{formatAccelerator(hotkey)}</kbd>
            </>
          )}
        </h1>
        <p className="header__subtitle">
          {total > 0
            ? `${formatCount(total)} words read back to you`
            : 'Nothing read aloud yet.'}
        </p>
      </div>

      <button className="button" onClick={onOpenSettings} type="button">
        Settings
      </button>
    </header>
  )
}

function PermissionBanner({ onGrant }: { onGrant: () => void }) {
  return (
    <div className="banner">
      <div>
        <strong>Bell needs Accessibility permission</strong>
        <p>Without it, Bell cannot read what you have highlighted in other apps.</p>
      </div>
      <button className="button button--primary" onClick={onGrant} type="button">
        Grant access
      </button>
    </div>
  )
}

function App() {
  const [utterances, setUtterances] = useState<Utterance[]>([])
  const [stats, setStats] = useState<Stats>(EMPTY_STATS)
  const [sources, setSources] = useState<TopSource[]>([])
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [search, setSearch] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [hasPermission, setHasPermission] = useState(true)

  const refresh = useCallback(async () => {
    const [list, nextStats, nextSources] = await Promise.all([
      window.bell.listUtterances(100, 0, search),
      window.bell.stats(),
      window.bell.topSources(),
    ])
    setUtterances(list)
    setStats(nextStats)
    setSources(nextSources)
  }, [search])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    void window.bell.getSettings().then(setSettings)
    void window.bell.permissionStatus().then(setHasPermission)

    const unsubscribeHistory = window.bell.onHistoryChanged(() => void refresh())
    const unsubscribeSettings = window.bell.onOpenSettings(() => setShowSettings(true))

    return () => {
      unsubscribeHistory()
      unsubscribeSettings()
    }
  }, [refresh])

  const handleDelete = async (id: string) => {
    await window.bell.deleteUtterance(id)
    await refresh()
  }

  return (
    <div className="page">
      <div className="titlebar" />
      <Header
        total={stats.total}
        hotkey={settings.hotkey}
        onOpenSettings={() => setShowSettings(true)}
      />

      {!hasPermission && (
        <PermissionBanner
          onGrant={() => {
            void window.bell.requestPermission()
            // The system prompt is asynchronous and out of process, so re-check
            // shortly after rather than assuming the grant succeeded.
            setTimeout(() => void window.bell.permissionStatus().then(setHasPermission), 1500)
          }}
        />
      )}

      <div className="columns">
        <main className="primary">
          <RecentlyRead
            utterances={utterances}
            onReplay={(id) => void window.bell.replay(id)}
            onDelete={(id) => void handleDelete(id)}
            search={search}
            onSearchChange={setSearch}
          />
        </main>

        <aside className="aside">
          <StatCards stats={stats} />
          <TopSources sources={sources} />
        </aside>
      </div>

      {showSettings && (
        <SettingsModal
          settings={settings}
          onClose={() => setShowSettings(false)}
          onSaved={setSettings}
        />
      )}
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
