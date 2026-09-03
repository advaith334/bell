import type { Metadata } from 'next'
import { OpenApp } from '@/components/OpenApp'

export const metadata: Metadata = { title: 'Back to Pilcrow', robots: { index: false } }

export default function Return() {
  return (
    <div className="mx-auto max-w-lg px-6 py-32 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">Thanks</h1>
      <p className="mt-4 leading-relaxed opacity-70">
        Any change you made is saved. Pilcrow will refresh next time you use it.
      </p>
      <OpenApp href="pilcrow://billing/return" label="Open Pilcrow" />
    </div>
  )
}
