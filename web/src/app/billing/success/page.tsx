import type { Metadata } from 'next'
import { OpenApp } from '@/components/OpenApp'

export const metadata: Metadata = { title: 'Welcome to Pro', robots: { index: false } }

export default function Success() {
  return (
    <div className="mx-auto max-w-lg px-6 py-32 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">You&rsquo;re all set</h1>
      <p className="mt-4 leading-relaxed opacity-70">
        Pilcrow Pro is active. Head back to the app — it will pick this up on its own within a few
        seconds.
      </p>

      {/*
        Stripe's webhook can lag this redirect. The app polls after checkout for
        exactly that reason, so nobody has to click anything twice.
      */}
      <OpenApp href="pilcrow://billing/return" label="Open Pilcrow" />
    </div>
  )
}
