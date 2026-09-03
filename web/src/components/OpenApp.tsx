'use client'

import { useEffect } from 'react'

/**
 * Bounces back into the desktop app over the custom scheme.
 *
 * The automatic attempt is deliberately delayed. Firing it on mount can be
 * swallowed by the browser as an unrequested navigation, and the visible link is
 * the reliable path — it is a real user gesture. Someone who does not have
 * Pilcrow installed simply sees the page and nothing happens, which is correct.
 */
export function OpenApp({ href, label }: { href: string; label: string }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      window.location.href = href
    }, 800)
    return () => clearTimeout(timer)
  }, [href])

  return (
    <a
      href={href}
      className="mt-9 inline-block rounded-xl bg-[var(--color-chord)] px-7 py-3.5 font-medium text-white transition hover:brightness-110"
    >
      {label}
    </a>
  )
}
