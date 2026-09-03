import { createRoot } from 'react-dom/client'
import { useCallback, useEffect, useState } from 'react'
import type { AccountState, QuotaReason, Settings, Stats, TopSource, Utterance } from '@/shared/types'
import { DEFAULT_SETTINGS, EMPTY_ACCOUNT_STATE } from '@/shared/types'
import { formatAccelerator } from '@/shared/shortcut'
import { RecentlyRead } from './RecentlyRead'
import { StatCards, TopSources, QuotaCard } from './Sidebar'
import { SettingsModal } from './SettingsModal'
import { SignIn } from './SignIn'
import { UpgradeSheet } from './UpgradeSheet'
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
        <strong>Pilcrow needs Accessibility permission</strong>
        <p>Without it, Pilcrow cannot read what you have highlighted in other apps.</p>
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
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [account, setAccount] = useState<AccountState>(EMPTY_ACCOUNT_STATE)
  const [upgradeReason, setUpgradeReason] = useState<QuotaReason | null>(null)
  const [showUpgrade, setShowUpgrade] = useState(false)

  const refresh = useCallback(async () => {
    const [list, nextStats, nextSources] = await Promise.all([
      window.pilcrow.listUtterances(100, 0, search),
      window.pilcrow.stats(),
      window.pilcrow.topSources(),
    ])
    setUtterances(list)
    setStats(nextStats)
    setSources(nextSources)
  }, [search])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    void window.pilcrow.getSettings().then(setSettings)
    void window.pilcrow.permissionStatus().then(setHasPermission)
    void window.pilcrow.getAccount().then(setAccount)

    const unsubscribeHistory = window.pilcrow.onHistoryChanged(() => void refresh())
    const unsubscribeSettings = window.pilcrow.onOpenSettings(() => setShowSettings(true))
    const unsubscribeAccount = window.pilcrow.onAccount(setAccount)
    const unsubscribeUpgrade = window.pilcrow.onShowUpgrade(() => setShowUpgrade(true))

    // Highlight whichever row is being read, so the list reflects live state.
    const unsubscribeStatus = window.pilcrow.onStatus((status) => {
      setPlayingId(status.state === 'speaking' ? (status.utteranceId ?? null) : null)

      // The paywall appears the moment a read is refused, which is the only
      // moment the offer is relevant.
      if (status.state === 'needs-upgrade') {
        setUpgradeReason(status.quotaReason ?? null)
        setShowUpgrade(true)
      }
    })

    // Entitlement can change out from under us — a subscription bought on
    // another machine, or one that lapsed while the window was open.
    const onFocus = () => void window.pilcrow.refreshAccount().then(setAccount)
    window.addEventListener('focus', onFocus)

    return () => {
      unsubscribeHistory()
      unsubscribeSettings()
      unsubscribeStatus()
      unsubscribeAccount()
      unsubscribeUpgrade()
      window.removeEventListener('focus', onFocus)
    }
  }, [refresh])

  const handleDelete = async (id: string) => {
    await window.pilcrow.deleteUtterance(id)
    await refresh()
  }

  if (!account.signedIn) {
    return (
      <div className="page">
        <div className="titlebar" />
        <SignIn error={account.error} />
      </div>
    )
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
            void window.pilcrow.requestPermission()
            // The system prompt is asynchronous and out of process, so re-check
            // shortly after rather than assuming the grant succeeded.
            setTimeout(() => void window.pilcrow.permissionStatus().then(setHasPermission), 1500)
          }}
        />
      )}

      <div className="columns">
        <main className="primary">
          <RecentlyRead
            utterances={utterances}
            playingId={playingId}
            onReplay={(id) => void window.pilcrow.replay(id)}
            onStop={() => void window.pilcrow.stop()}
            onDelete={(id) => void handleDelete(id)}
            search={search}
            onSearchChange={setSearch}
          />
        </main>

        <aside className="aside">
          <QuotaCard account={account} onUpgrade={() => setShowUpgrade(true)} />
          <StatCards stats={stats} />
          <TopSources sources={sources} />
        </aside>
      </div>

      {showSettings && (
        <SettingsModal
          settings={settings}
          account={account}
          onClose={() => setShowSettings(false)}
          onSaved={setSettings}
        />
      )}

      {showUpgrade && (
        <UpgradeSheet
          reason={upgradeReason}
          freeReadLimit={account.account?.limits.freeReadLimit ?? 20}
          onClose={() => setShowUpgrade(false)}
        />
      )}
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
