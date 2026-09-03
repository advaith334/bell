import type { Metadata } from 'next'
import { site } from '@/lib/site'
import { DownloadButton } from '@/components/DownloadButton'

export const metadata: Metadata = { title: 'Pricing' }

const FREE = [`${site.price.freeReads} reads`, 'Every voice and every setting', 'Unlimited replays of anything you have already heard']

const PRO = [
  'Unlimited reads',
  `${(site.price.includedChars / 1000).toLocaleString()}k characters a month — about ${Math.round(site.price.includedChars / 6000)} long articles`,
  'No API key, ever — the voice is included',
  'Cancel any time, from inside the app',
]

const FAQ = [
  {
    q: 'Do I need an ElevenLabs account?',
    a: 'No. Pilcrow supplies the voice. That is most of what you are paying for — the alternative is signing up for an API, generating a key, and watching a separate meter.',
  },
  {
    q: 'What happens after the free reads run out?',
    a: `Pilcrow tells you, once, at the moment you try the ${site.price.freeReads + 1}st read. Nothing you have already listened to stops working, and it keeps replaying offline whether or not you subscribe.`,
  },
  {
    q: 'What is the monthly character allowance?',
    a: `${site.price.includedChars.toLocaleString()} characters, which is far more than a heavy reader gets through — roughly a novel a month. Past it Pilcrow keeps reading, just a little slower, rather than cutting you off mid-paragraph.`,
  },
  {
    q: 'Does my text leave my Mac?',
    a: 'Your selection is sent to Pilcrow and on to the voice service so it can be spoken; that is unavoidable for a cloud voice. It is not stored, not used for training, and Pilcrow refuses to capture anything while a password field has secure input active.',
  },
  {
    q: 'What if I cancel?',
    a: 'Access runs to the end of the period you paid for, and everything already downloaded to your Mac keeps working indefinitely.',
  },
]

export default function Pricing() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-20">
      <h1 className="text-center text-4xl font-semibold tracking-tight">Simple pricing</h1>
      <p className="mx-auto mt-4 max-w-md text-center leading-relaxed opacity-70">
        Free to try properly. One price after that, with the voice included.
      </p>

      <div className="mt-14 grid gap-6 sm:grid-cols-2">
        <div className="rounded-2xl border border-black/8 p-8 dark:border-white/10">
          <h2 className="text-lg font-semibold">Free</h2>
          <p className="mt-3 text-4xl font-semibold tracking-tight">$0</p>
          <ul className="mt-7 space-y-3 text-sm opacity-75">
            {FREE.map((item) => (
              <li key={item} className="flex gap-2.5">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-40" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border-2 border-[var(--color-chord)] bg-[var(--color-chord)]/[0.04] p-8">
          <h2 className="text-lg font-semibold">Pro</h2>
          <p className="mt-3 flex items-baseline gap-2">
            <span className="text-4xl font-semibold tracking-tight">{site.price.amount}</span>
            <span className="text-sm opacity-60">per {site.price.period}</span>
          </p>
          <ul className="mt-7 space-y-3 text-sm opacity-75">
            {PRO.map((item) => (
              <li key={item} className="flex gap-2.5">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-chord)]" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-14 flex justify-center">
        <DownloadButton label="Start free" />
      </div>

      <div className="mt-24">
        <h2 className="mb-8 text-2xl font-semibold tracking-tight">Questions</h2>
        <dl className="space-y-8">
          {FAQ.map((item) => (
            <div key={item.q}>
              <dt className="mb-2 font-semibold">{item.q}</dt>
              <dd className="text-sm leading-relaxed opacity-70">{item.a}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}
