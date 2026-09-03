import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { callerFrom } from './context.js'
import { createCheckoutSession, createPortalSession, handleWebhook } from './billing.js'
import { config } from '../shared/config.js'
import { UserEntity } from '../shared/entities.js'
import { describeEntitlement, ensureUser, getMonthlyChars } from '../shared/entitlement.js'
import { getElevenLabsKey } from '../shared/secrets.js'
import { FREE_READ_LIMIT, FREE_CHAR_LIMIT, MAX_CHARS_PER_REQUEST } from '../shared/plans.js'
import { logger } from '../shared/observability.js'
import type { Account } from '../shared/schemas.js'

/**
 * The control plane. Everything here is small JSON; the audio path is a separate
 * function entirely (`src/tts`).
 *
 * There is no authentication code in this file on purpose — API Gateway's JWT
 * authorizer rejects bad tokens before the Lambda is invoked, so routes can read
 * `sub` from the claims and get on with it. The one exception is the Stripe
 * webhook, which is authenticated by its signature instead.
 */

export const app = new Hono()

app.use('*', cors({ origin: [config.webBaseUrl], allowMethods: ['GET', 'POST', 'OPTIONS'] }))

app.onError((error, c) => {
  if (error instanceof HTTPException) return error.getResponse()
  logger.error('unhandled error', { error, path: c.req.path })
  return c.json({ error: 'internal_error' }, 500)
})

app.get('/health', (c) => c.json({ ok: true, env: config.env }))

/**
 * The client's single source of truth for what it is allowed to do. Also the
 * point at which a Cognito identity becomes a Pilcrow user — there is no separate
 * signup call, so a first launch is one round trip.
 */
app.get('/me', async (c) => {
  const caller = callerFrom(c)
  const user = await ensureUser(caller.userId, caller.email, caller.provider)
  const monthlyChars = await getMonthlyChars(caller.userId)

  const account: Account = {
    userId: user.userId,
    email: user.email ?? null,
    entitlement: describeEntitlement(user, monthlyChars),
    limits: {
      freeReadLimit: FREE_READ_LIMIT,
      freeCharLimit: FREE_CHAR_LIMIT,
      maxCharsPerRequest: MAX_CHARS_PER_REQUEST,
    },
  }
  return c.json(account)
})

/**
 * Proxied so the ElevenLabs key never leaves the backend. Cached for an hour:
 * the voice catalogue changes on the order of weeks, and every user's Settings
 * modal opening a fresh upstream call would be silly.
 */
let voiceCache: { at: number; body: unknown } | null = null
const VOICE_TTL_MS = 60 * 60 * 1000

app.get('/voices', async (c) => {
  if (voiceCache && Date.now() - voiceCache.at < VOICE_TTL_MS) {
    return c.json(voiceCache.body as object)
  }

  const response = await fetch(`${config.elevenLabsBaseUrl}/voices`, {
    headers: { 'xi-api-key': await getElevenLabsKey() },
  })

  if (!response.ok) {
    logger.error('voice list failed', { status: response.status })
    // A stale list beats an empty Settings dropdown.
    if (voiceCache) return c.json(voiceCache.body as object)
    return c.json({ voices: [] })
  }

  const data = (await response.json()) as {
    voices?: Array<{ voice_id: string; name: string; preview_url?: string }>
  }

  const body = {
    voices: (data.voices ?? []).map((voice) => ({
      voiceId: voice.voice_id,
      name: voice.name,
      previewUrl: voice.preview_url,
    })),
  }

  voiceCache = { at: Date.now(), body }
  return c.json(body)
})

app.post('/billing/checkout', async (c) => {
  const caller = callerFrom(c)
  const { data: user } = await UserEntity.get({ userId: caller.userId }).go()
  return c.json({ url: await createCheckoutSession(caller.userId, caller.email ?? user?.email) })
})

app.post('/billing/portal', async (c) => {
  const caller = callerFrom(c)
  try {
    return c.json({ url: await createPortalSession(caller.userId) })
  } catch (error) {
    if ((error as Error).message === 'no_customer') {
      // They have never paid, so there is nothing to manage — send them to buy
      // instead of showing an error they cannot act on.
      return c.json({ url: await createCheckoutSession(caller.userId, caller.email) })
    }
    throw error
  }
})

/**
 * No authorizer on this route (see the Terraform in infra/modules/api). The
 * signature check inside `handleWebhook` is what authenticates it.
 */
app.post('/stripe/webhook', async (c) => {
  const raw = await c.req.text()
  try {
    await handleWebhook(raw, c.req.header('stripe-signature'))
  } catch (error) {
    logger.error('webhook rejected', { error })
    // A 400 tells Stripe not to retry a request we will never accept; anything
    // else it should retry, so signature failures must not be a 500.
    return c.json({ error: 'invalid_signature' }, 400)
  }
  return c.json({ received: true })
})
