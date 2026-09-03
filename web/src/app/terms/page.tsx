import type { Metadata } from 'next'
import { site } from '@/lib/site'
import { Prose } from '@/components/Prose'

export const metadata: Metadata = { title: 'Terms' }

/** Placeholder with real substance. Have counsel review before taking money. */
export default function Terms() {
  return (
    <Prose title="Terms of service" updated="before launch — review with counsel">
      <h2>The service</h2>
      <p>
        Pilcrow is a macOS application that reads highlighted text aloud using a cloud text-to-speech
        service. Access to synthesis requires an account.
      </p>

      <h2>Free and paid use</h2>
      <p>
        New accounts include {site.price.freeReads} free reads. Beyond that, continued use requires a
        subscription at {site.price.amount} per {site.price.period}, which includes{' '}
        {site.price.includedChars.toLocaleString()} characters of synthesis per month. Past that
        allowance we may slow synthesis rather than stop it.
      </p>

      <h2>Billing</h2>
      <p>
        Subscriptions renew monthly until cancelled. You can cancel at any time from inside the app;
        access continues to the end of the period you have paid for. We do not prorate partial
        months.
      </p>

      <h2>Acceptable use</h2>
      <p>
        Do not use Pilcrow to synthesize unlawful content, to impersonate a real person, or in a way
        that circumvents the usage limits — including by automating the application. We may suspend
        an account for any of these.
      </p>

      <h2>No warranty</h2>
      <p>
        Pilcrow is provided as is. We depend on a third-party voice service and cannot guarantee
        uninterrupted availability.
      </p>

      <h2>Contact</h2>
      <p>
        <a className="underline underline-offset-4" href={`mailto:${site.supportEmail}`}>
          {site.supportEmail}
        </a>
      </p>
    </Prose>
  )
}
