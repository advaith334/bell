#!/usr/bin/env node --experimental-strip-types
import Stripe from 'stripe'
import { STRIPE_PRICE_LOOKUP_KEY } from '../services/src/shared/plans.js'

/**
 * Creates the Stripe objects Pilcrow needs, idempotently.
 *
 *   STRIPE_SECRET_KEY=sk_test_... node --experimental-strip-types scripts/stripe-bootstrap.ts
 *
 * Run it once against test mode and once against live. Re-running is safe: every
 * object is looked up before it is created.
 *
 * This is a script rather than Terraform on purpose. The community Stripe
 * providers are thin and unofficial, and billing is the last place to accept a
 * dependency we would have to debug ourselves. Everything Stripe can be told
 * declaratively is here; the rest (account verification, bank details, Tax
 * registration, the webhook signing secret) genuinely requires the dashboard and
 * is written up in docs/INFRA-MANUAL-STEPS.md.
 */

const key = process.env.STRIPE_SECRET_KEY
if (!key) {
  console.error('Set STRIPE_SECRET_KEY (sk_test_... or sk_live_...)')
  process.exit(1)
}

const stripe = new Stripe(key, { apiVersion: '2025-02-24.acacia' })
const live = key.startsWith('sk_live_')

const PRODUCT_NAME = 'Pilcrow Pro'
const UNIT_AMOUNT = 999 // $9.99
const CURRENCY = 'usd'

async function findProduct(): Promise<Stripe.Product | null> {
  // Stripe has no "get by name", so this searches on metadata we control.
  const search = await stripe.products.search({ query: `metadata['pilcrow']:'pro'`, limit: 1 })
  return search.data[0] ?? null
}

async function main(): Promise<void> {
  console.log(`\nPilcrow Stripe bootstrap — ${live ? 'LIVE' : 'test'} mode\n`)

  let product = await findProduct()
  if (product) {
    console.log(`  product      ${product.id} (exists)`)
  } else {
    product = await stripe.products.create({
      name: PRODUCT_NAME,
      description: 'Unlimited reads in Pilcrow, with a natural voice and no API key of your own.',
      metadata: { pilcrow: 'pro' },
    })
    console.log(`  product      ${product.id} (created)`)
  }

  // The lookup key is the whole point: application code resolves the price by
  // name, so test and live can have different price ids and nothing hardcodes one.
  const existing = await stripe.prices.list({
    lookup_keys: [STRIPE_PRICE_LOOKUP_KEY],
    active: true,
    limit: 1,
  })

  let price = existing.data[0]
  if (price) {
    console.log(`  price        ${price.id} (exists, ${price.unit_amount} ${price.currency})`)
    if (price.unit_amount !== UNIT_AMOUNT) {
      // Prices are immutable in Stripe. Changing what you charge means creating a
      // new price and moving the lookup key onto it, which is deliberately a
      // conscious act rather than something a bootstrap script does for you.
      console.warn(
        `\n  ! The existing price is ${price.unit_amount}, not ${UNIT_AMOUNT}.\n` +
          `    Stripe prices are immutable. To change what you charge, create a new price\n` +
          `    and transfer the lookup key "${STRIPE_PRICE_LOOKUP_KEY}" to it. Existing\n` +
          `    subscribers keep the old price until you migrate them.\n`,
      )
    }
  } else {
    price = await stripe.prices.create({
      product: product.id,
      unit_amount: UNIT_AMOUNT,
      currency: CURRENCY,
      recurring: { interval: 'month' },
      lookup_key: STRIPE_PRICE_LOOKUP_KEY,
      tax_behavior: 'exclusive',
    })
    console.log(`  price        ${price.id} (created, $${(UNIT_AMOUNT / 100).toFixed(2)}/mo)`)
  }

  // The Billing Portal is why we build no subscription UI at all: cancellation,
  // card updates and invoice history all live there.
  const portals = await stripe.billingPortal.configurations.list({ limit: 1, active: true })
  if (portals.data[0]) {
    console.log(`  portal       ${portals.data[0].id} (exists)`)
  } else {
    const portal = await stripe.billingPortal.configurations.create({
      business_profile: {
        headline: 'Pilcrow',
        privacy_policy_url: 'https://pilcrow.app/privacy',
        terms_of_service_url: 'https://pilcrow.app/terms',
      },
      features: {
        customer_update: { enabled: true, allowed_updates: ['email', 'address', 'tax_id'] },
        invoice_history: { enabled: true },
        payment_method_update: { enabled: true },
        subscription_cancel: {
          enabled: true,
          // At period end, not immediately — they paid for the month.
          mode: 'at_period_end',
          cancellation_reason: {
            enabled: true,
            options: ['too_expensive', 'missing_features', 'unused', 'switched_service', 'other'],
          },
        },
      },
    })
    console.log(`  portal       ${portal.id} (created)`)
  }

  console.log(`
Next, in the Stripe dashboard (${live ? 'live' : 'test'} mode):

  1. Developers → Webhooks → Add endpoint
       URL:    <terraform output stripe_webhook_url>
       Events: checkout.session.completed
               customer.subscription.created
               customer.subscription.updated
               customer.subscription.deleted
               invoice.payment_failed

  2. Copy the signing secret (whsec_...) into the Pilcrow secret:
       aws secretsmanager put-secret-value \\
         --secret-id pilcrow-${live ? 'prod' : 'dev'}-stripe-webhook \\
         --secret-string 'whsec_...'

  3. Put this API key into the Pilcrow secret:
       aws secretsmanager put-secret-value \\
         --secret-id pilcrow-${live ? 'prod' : 'dev'}-stripe \\
         --secret-string '${key.slice(0, 12)}...'
`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
