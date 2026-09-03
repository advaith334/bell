import Stripe from 'stripe'
import { config } from '../shared/config.js'
import { UserEntity, StripeEventEntity } from '../shared/entities.js'
import { getStripeKey, getStripeWebhookSecret } from '../shared/secrets.js'
import { STRIPE_PRICE_LOOKUP_KEY } from '../shared/plans.js'
import { logger } from '../shared/observability.js'

/**
 * Stripe Checkout and the Billing Portal do all the customer-facing work — card
 * capture, 3DS, tax, invoices, cancellation, dunning emails. We build no billing
 * UI of our own, which is the only sane choice at this size.
 */

let cached: Stripe | null = null

export async function stripe(): Promise<Stripe> {
  if (cached) return cached
  cached = new Stripe(await getStripeKey(), { apiVersion: '2025-02-24.acacia' })
  return cached
}

/** Resolved by lookup key rather than a hardcoded `price_...`, so test and live agree. */
async function priceId(client: Stripe): Promise<string> {
  const prices = await client.prices.list({ lookup_keys: [STRIPE_PRICE_LOOKUP_KEY], active: true, limit: 1 })
  const price = prices.data[0]
  if (!price) {
    throw new Error(
      `No active Stripe price with lookup_key "${STRIPE_PRICE_LOOKUP_KEY}". Run scripts/stripe-bootstrap.ts.`,
    )
  }
  return price.id
}

/**
 * Creates the customer on first checkout rather than at signup. Most signups
 * never pay, and an unused Stripe customer per free user is just clutter.
 */
async function customerFor(client: Stripe, userId: string, email?: string): Promise<string> {
  const { data: user } = await UserEntity.get({ userId }).go()
  if (user?.stripeCustomerId) return user.stripeCustomerId

  const customer = await client.customers.create({
    email,
    metadata: { pilcrowUserId: userId },
  })

  await UserEntity.upsert({ userId }).set({ stripeCustomerId: customer.id }).go()
  return customer.id
}

export async function createCheckoutSession(userId: string, email?: string): Promise<string> {
  const client = await stripe()
  const session = await client.checkout.sessions.create({
    mode: 'subscription',
    customer: await customerFor(client, userId, email),
    line_items: [{ price: await priceId(client), quantity: 1 }],
    // Both are load-bearing: client_reference_id is the fallback identity if the
    // customer lookup ever misses, and the metadata rides onto the subscription.
    client_reference_id: userId,
    subscription_data: { metadata: { pilcrowUserId: userId } },
    allow_promotion_codes: true,
    automatic_tax: { enabled: true },
    success_url: `${config.webBaseUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${config.webBaseUrl}/billing/cancelled`,
  })

  if (!session.url) throw new Error('Stripe returned a Checkout session with no URL')
  return session.url
}

export async function createPortalSession(userId: string): Promise<string> {
  const client = await stripe()
  const { data: user } = await UserEntity.get({ userId }).go()
  if (!user?.stripeCustomerId) throw new Error('no_customer')

  const session = await client.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${config.webBaseUrl}/billing/return`,
  })
  return session.url
}

/** Maps a Stripe subscription onto our entitlement fields. */
function planFrom(subscription: Stripe.Subscription): {
  plan: 'free' | 'pro'
  status: 'none' | 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid'
  currentPeriodEnd: number
} {
  const status = subscription.status
  const active = status === 'active' || status === 'trialing' || status === 'past_due'
  return {
    plan: active ? 'pro' : 'free',
    status: (['active', 'trialing', 'past_due', 'canceled', 'unpaid'] as const).includes(
      status as never,
    )
      ? (status as 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid')
      : 'none',
    // Seconds from Stripe, milliseconds everywhere in our code.
    currentPeriodEnd: subscription.current_period_end * 1000,
  }
}

async function userIdForCustomer(customerId: string): Promise<string | null> {
  const { data } = await UserEntity.query.byStripeCustomer({ stripeCustomerId: customerId }).go()
  return data[0]?.userId ?? null
}

async function applySubscription(subscription: Stripe.Subscription): Promise<void> {
  const customerId =
    typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id

  const userId =
    (subscription.metadata?.['pilcrowUserId'] as string | undefined) ??
    (await userIdForCustomer(customerId))

  if (!userId) {
    logger.error('subscription for an unknown customer', { customerId, subscriptionId: subscription.id })
    return
  }

  const mapped = planFrom(subscription)
  await UserEntity.upsert({ userId })
    .set({
      ...mapped,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscription.id,
    })
    .go()

  logger.info('entitlement updated', { userId, plan: mapped.plan, status: mapped.status })
}

export async function handleWebhook(rawBody: string, signature: string | undefined): Promise<void> {
  const client = await stripe()
  const secret = await getStripeWebhookSecret()

  // Throws on a bad signature, which is the whole point — this route has no
  // authorizer in front of it, so the signature IS the authentication.
  const event = client.webhooks.constructEvent(rawBody, signature ?? '', secret)

  // Stripe redelivers on any non-2xx and occasionally duplicates on 2xx. Claim
  // the event id first; a duplicate simply loses the race and returns.
  try {
    await StripeEventEntity.create({ eventId: event.id, eventType: event.type }).go()
  } catch {
    logger.info('duplicate stripe event ignored', { eventId: event.id, type: event.type })
    return
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object
      if (typeof session.subscription === 'string') {
        await applySubscription(await client.subscriptions.retrieve(session.subscription))
      }
      break
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      await applySubscription(event.data.object)
      break

    case 'invoice.payment_failed': {
      const invoice = event.data.object
      // Do not downgrade here. Stripe's dunning will retry for days and move the
      // subscription to past_due then canceled on its own; acting early would
      // lock out someone whose card simply needed a second attempt.
      logger.warn('payment failed', {
        customerId: typeof invoice.customer === 'string' ? invoice.customer : undefined,
        attempt: invoice.attempt_count,
      })
      break
    }

    default:
      logger.info('unhandled stripe event', { type: event.type })
  }
}
