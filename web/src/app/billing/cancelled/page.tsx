import type { Metadata } from 'next'
import { OpenApp } from '@/components/OpenApp'

export const metadata: Metadata = { title: 'Checkout cancelled', robots: { index: false } }

export default function Cancelled() {
  return (
    <div className="mx-auto max-w-lg px-6 py-32 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">No charge made</h1>
      <p className="mt-4 leading-relaxed opacity-70">
        You can go back to Pilcrow and pick this up whenever you like. Anything you have already
        listened to still replays.
      </p>
      <OpenApp href="pilcrow://home" label="Back to Pilcrow" />
    </div>
  )
}
