import Link from 'next/link'
import { site } from '@/lib/site'

export function DownloadButton({ label = 'Download for Mac' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <Link
        href="/download"
        className="rounded-xl bg-[var(--color-chord)] px-7 py-3.5 text-base font-medium text-white transition hover:brightness-110 active:scale-[0.98]"
      >
        {label}
      </Link>
      <p className="text-xs opacity-50">
        {site.requirements} · {site.price.freeReads} reads free
      </p>
    </div>
  )
}
