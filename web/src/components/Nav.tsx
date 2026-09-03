import Link from 'next/link'
import { site } from '@/lib/site'

export function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-black/5 bg-[var(--color-sand-50)]/80 backdrop-blur dark:border-white/10 dark:bg-[#171614]/80">
      <nav className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          ¶ {site.name}
        </Link>

        <div className="flex items-center gap-6 text-sm">
          <Link href="/#how" className="opacity-70 transition hover:opacity-100">
            How it works
          </Link>
          <Link href="/pricing" className="opacity-70 transition hover:opacity-100">
            Pricing
          </Link>
          <Link
            href="/download"
            className="rounded-lg bg-[var(--color-chord)] px-4 py-2 font-medium text-white transition hover:brightness-110"
          >
            Download
          </Link>
        </div>
      </nav>
    </header>
  )
}
