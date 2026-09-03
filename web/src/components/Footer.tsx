import Link from 'next/link'
import { site } from '@/lib/site'

export function Footer() {
  return (
    <footer className="border-t border-black/5 dark:border-white/10">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-6 py-10 text-sm opacity-70 sm:flex-row sm:items-center sm:justify-between">
        <p>
          © {new Date().getFullYear()} {site.name}
        </p>
        <div className="flex flex-wrap gap-6">
          <Link href="/pricing" className="transition hover:opacity-100">
            Pricing
          </Link>
          <Link href="/privacy" className="transition hover:opacity-100">
            Privacy
          </Link>
          <Link href="/terms" className="transition hover:opacity-100">
            Terms
          </Link>
          <Link href="/support" className="transition hover:opacity-100">
            Support
          </Link>
        </div>
      </div>
    </footer>
  )
}
