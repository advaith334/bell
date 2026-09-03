import Link from 'next/link'
import { site } from '@/lib/site'
import { DownloadButton } from '@/components/DownloadButton'

/**
 * The landing page. Its whole job is one comparison: everything else that reads
 * text aloud treats a line break as a full stop, so anything that is not flowing
 * prose — terminal output, a changelog, a bulleted list — comes out as a stutter.
 * Pilcrow does not. That is the product, and it is what the hero has to land.
 */

const FEATURES = [
  {
    title: 'Newlines are not full stops',
    body: 'A blank line is a paragraph and gets a real pause. Two adjacent lines get a 0.15s beat. That single distinction is why build output does not sound like it is being dictated by someone with a stutter.',
  },
  {
    title: 'It knows what it is looking at',
    body: 'Terminal, log, Markdown, code or prose — each is normalized differently. ANSI escapes, box-drawing characters and smart quotes are stripped before anything is spoken.',
  },
  {
    title: 'Hard-wrapped text is rejoined',
    body: 'Pilcrow finds the modal line width of your selection. A line that ends near it without punctuation is a wrap, not a sentence, so it gets joined rather than paused on.',
  },
  {
    title: 'Code blocks, your way',
    body: 'Announce them ("code block, twelve lines, skipped"), drop them silently, or read every character. Most people want the first and have never been offered it.',
  },
  {
    title: 'It starts fast',
    body: 'The first chunk is deliberately short so audio begins almost immediately, then chunks grow for better prosody. Each request carries its neighbours as context, so the seams do not sound like separate takes.',
  },
  {
    title: 'Replays are instant and offline',
    body: 'Audio is cached on your Mac, keyed by the text itself. Anything you have heard once plays again immediately, costs nothing, and works on a plane.',
  },
]

const STEPS = [
  { n: '1', title: 'Highlight', body: 'Any text, in any app — a terminal, a PDF, a web page, your editor.' },
  { n: '2', title: 'Press ⌥`', body: 'Pilcrow lives in the menu bar and reads whatever is selected.' },
  { n: '3', title: 'Listen', body: 'It starts speaking in under a second, and you carry on with something else.' },
]

export default function Home() {
  return (
    <>
      <section className="mx-auto max-w-3xl px-6 pb-20 pt-24 text-center">
        <p className="mb-5 inline-block rounded-full border border-black/10 px-3 py-1 text-xs opacity-60 dark:border-white/15">
          For macOS
        </p>

        <h1 className="text-balance text-5xl font-semibold leading-[1.08] tracking-tight sm:text-6xl">
          Highlight anything.
          <br />
          Hear it read back.
        </h1>

        <p className="mx-auto mt-6 max-w-xl text-pretty text-lg leading-relaxed opacity-70">
          Every other read-aloud tool treats a line break as a full stop. Paste in a build log and
          it stutters. Pilcrow knows the difference between a wrapped line and a real paragraph — so
          it just sounds like someone reading.
        </p>

        <div className="mt-10">
          <DownloadButton />
        </div>
      </section>

      {/*
        The demo is the pitch. Two clips of the same terminal output, one read by
        the macOS system voice and one by Pilcrow, is more persuasive than the
        entire rest of this page — record it before launch and drop the files in
        public/demo/.
      */}
      <section className="mx-auto max-w-3xl px-6 pb-24">
        <div className="rounded-2xl border border-black/8 bg-white/60 p-8 dark:border-white/10 dark:bg-white/5">
          <h2 className="text-sm font-semibold uppercase tracking-wider opacity-50">
            The same terminal output
          </h2>

          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            <div>
              <p className="mb-3 text-sm font-medium opacity-70">Every other tool</p>
              <audio controls preload="none" className="w-full">
                <source src="/demo/before.mp3" type="audio/mpeg" />
              </audio>
              <p className="mt-2 text-xs opacity-50">A pause after every single line.</p>
            </div>

            <div>
              <p className="mb-3 text-sm font-medium opacity-70">Pilcrow</p>
              <audio controls preload="none" className="w-full">
                <source src="/demo/after.mp3" type="audio/mpeg" />
              </audio>
              <p className="mt-2 text-xs opacity-50">Pauses only where a paragraph actually is.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="how" className="mx-auto max-w-4xl px-6 pb-24">
        <div className="grid gap-8 sm:grid-cols-3">
          {STEPS.map((step) => (
            <div key={step.n}>
              <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-chord)] text-sm font-semibold text-white">
                {step.n}
              </div>
              <h3 className="mb-1.5 font-semibold">{step.title}</h3>
              <p className="text-sm leading-relaxed opacity-70">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-6 pb-24">
        <h2 className="mb-10 text-3xl font-semibold tracking-tight">
          The part that took the longest
        </h2>

        <div className="grid gap-x-10 gap-y-9 sm:grid-cols-2">
          {FEATURES.map((feature) => (
            <div key={feature.title}>
              <h3 className="mb-2 font-semibold">{feature.title}</h3>
              <p className="text-sm leading-relaxed opacity-70">{feature.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-6 pb-28 text-center">
        <h2 className="text-3xl font-semibold tracking-tight">Try it on twenty things</h2>
        <p className="mx-auto mt-4 max-w-lg text-pretty leading-relaxed opacity-70">
          {site.price.freeReads} reads free, no card. After that it is {site.price.amount} a month
          and the voice is included — you never need an API key of your own.
        </p>
        <div className="mt-9">
          <DownloadButton />
        </div>
        <p className="mt-6 text-sm opacity-50">
          <Link href="/pricing" className="underline underline-offset-4">
            See what is included
          </Link>
        </p>
      </section>
    </>
  )
}
