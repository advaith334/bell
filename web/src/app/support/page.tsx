import type { Metadata } from 'next'
import { site } from '@/lib/site'
import { Prose } from '@/components/Prose'

export const metadata: Metadata = { title: 'Support' }

export default function Support() {
  return (
    <Prose title="Support" updated="—">
      <p>
        Email{' '}
        <a className="underline underline-offset-4" href={`mailto:${site.supportEmail}`}>
          {site.supportEmail}
        </a>
        . Include your macOS version and, if something sounded wrong, the text you highlighted —
        that last part is what actually lets us fix it, because every pause bug becomes a test case.
      </p>

      <h2>Pilcrow will not read anything</h2>
      <p>
        Check that Accessibility permission is granted in System Settings → Privacy &amp; Security →
        Accessibility. Without it Pilcrow cannot see what you have highlighted in other apps.
      </p>

      <h2>The shortcut does nothing</h2>
      <p>
        Another app may already own the combination. Pick a different one in Settings — Pilcrow
        requires a modifier, because a bare key would be swallowed system-wide.
      </p>

      <h2>Refunds</h2>
      <p>
        If Pilcrow is not what you expected, email within 30 days of a charge and we will refund it.
        No form to fill in.
      </p>
    </Prose>
  )
}
