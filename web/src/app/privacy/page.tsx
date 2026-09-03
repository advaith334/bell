import type { Metadata } from 'next'
import { site } from '@/lib/site'
import { Prose } from '@/components/Prose'

export const metadata: Metadata = { title: 'Privacy' }

/**
 * A starting point written to be accurate about what this system actually does —
 * not a template. It still needs a lawyer's eye before launch, and the GDPR/CCPA
 * specifics in docs/LAUNCH-PLAN.md are not covered here.
 */
export default function Privacy() {
  return (
    <Prose title="Privacy" updated="before launch — review with counsel">
      <h2>What Pilcrow sends</h2>
      <p>
        When you press the shortcut, the text you have highlighted is sent to Pilcrow&rsquo;s servers
        and on to our text-to-speech provider so it can be spoken. That is unavoidable for a cloud
        voice. We do not store the text of your selections, and it is not used to train anything.
      </p>

      <h2>What Pilcrow will not capture</h2>
      <p>
        Pilcrow refuses to read a selection while macOS reports secure input as active, which is
        what password fields use. It cannot capture anything you have not explicitly highlighted and
        then invoked it on.
      </p>

      <h2>What stays on your Mac</h2>
      <ul>
        <li>Your reading history, in a local SQLite database.</li>
        <li>The audio cache, so replays are instant and work offline.</li>
        <li>Your settings and your sign-in tokens, encrypted in the macOS Keychain.</li>
      </ul>
      <p>None of that is uploaded, and deleting the app removes it.</p>

      <h2>What we store on our servers</h2>
      <ul>
        <li>Your account: the identifier from Apple or Google, and your email address.</li>
        <li>How many reads and characters you have used, so we can apply your plan.</li>
        <li>Your Stripe customer and subscription identifiers.</li>
      </ul>
      <p>We do not store your selections, your history, or your audio.</p>

      <h2>Payments</h2>
      <p>
        Payments are handled entirely by Stripe. We never see or store your card details.
      </p>

      <h2>Deleting your account</h2>
      <p>
        Email <a className="underline underline-offset-4" href={`mailto:${site.supportEmail}`}>{site.supportEmail}</a>{' '}
        and we will delete your account and everything associated with it. Anything already on your
        Mac is yours to delete yourself.
      </p>
    </Prose>
  )
}
