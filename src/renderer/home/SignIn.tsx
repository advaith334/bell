import { useState } from 'react'

/**
 * The signed-out state. It replaces the whole page rather than sitting as a
 * banner, because there is nothing useful to do in Pilcrow before signing in —
 * a history list above a "you cannot use this" notice would just be teasing.
 */
export function SignIn({ error }: { error: string | null }) {
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const signIn = async () => {
    setBusy(true)
    setFailure(null)
    const result = await window.pilcrow.signIn()
    setBusy(false)
    if (!result.ok) setFailure(result.error ?? 'Sign-in did not complete.')
  }

  return (
    <div className="signin">
      <div className="signin__card">
        <h1 className="signin__title">Hear anything read back</h1>
        <p className="signin__body">
          Highlight text in any app, press your shortcut, and Pilcrow reads it aloud in a natural
          voice — with pauses where paragraphs actually are.
        </p>

        <button
          className="button button--primary button--large"
          type="button"
          disabled={busy}
          onClick={() => void signIn()}
        >
          {busy ? 'Waiting for your browser…' : 'Continue with Apple or Google'}
        </button>

        <p className="signin__note">
          20 reads free. No API key needed — the voice is included.
        </p>

        {busy && (
          <p className="signin__note">
            Sign-in opens in your browser. Come back here once it finishes.
          </p>
        )}

        {(failure ?? error) && <p className="signin__error">{failure ?? error}</p>}
      </div>
    </div>
  )
}
