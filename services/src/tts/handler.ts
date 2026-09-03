import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { Writable } from 'node:stream'
import type { LambdaFunctionURLEvent } from 'aws-lambda'
import { verifyAuthorization, UnauthorizedError, jwksReady } from '../shared/auth.js'
import { config } from '../shared/config.js'
import { UserEntity } from '../shared/entities.js'
import { consumeRead, isPro, recordSynthesis } from '../shared/entitlement.js'
import { getElevenLabsKey } from '../shared/secrets.js'
import { synthesizeRequestSchema } from '../shared/schemas.js'
import { FREE_READ_LIMIT, PRO_MONTHLY_CHARS, PRO_THROTTLE_DELAY_MS, currentPeriod } from '../shared/plans.js'
import { getMonthlyChars } from '../shared/entitlement.js'
import { logger, recordSynthesisMetrics, recordPaywallHit } from '../shared/observability.js'

/**
 * The audio proxy. One invocation per chunk; the client's utterance id ties them
 * together so the read is charged once.
 *
 * This runs behind a Lambda Function URL rather than API Gateway because the
 * response is binary: API Gateway would base64-encode every mp3 (a 33% tax
 * against a 6MB response ceiling) and buffer it whole. RESPONSE_STREAM returns
 * raw bytes as they arrive, which is both less machinery and lower latency.
 */

function respondJson(stream: Writable, statusCode: number, body: unknown): void {
  const out = awslambda.HttpResponseStream.from(stream, {
    statusCode,
    headers: { 'content-type': 'application/json' },
  })
  out.write(JSON.stringify(body))
  out.end()
}

async function handle(event: LambdaFunctionURLEvent, responseStream: Writable): Promise<void> {
  if (event.requestContext.http.method !== 'POST') {
    return respondJson(responseStream, 405, { error: 'method_not_allowed' })
  }

  let caller
  try {
    await jwksReady
    caller = await verifyAuthorization(event.headers.authorization ?? event.headers.Authorization)
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return respondJson(responseStream, 401, { error: 'unauthorized' })
    }
    throw error
  }

  const raw = event.isBase64Encoded && event.body
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : (event.body ?? '')

  const parsed = synthesizeRequestSchema.safeParse(JSON.parse(raw || '{}'))
  if (!parsed.success) {
    return respondJson(responseStream, 400, { error: 'bad_request', detail: parsed.error.flatten() })
  }
  const request = parsed.data

  logger.appendKeys({ userId: caller.userId, readId: request.readId, chunk: request.chunkIndex })

  const { data: user } = await UserEntity.get({ userId: caller.userId }).go()
  const pro = user ? isPro(user) : false

  const outcome = await consumeRead({ userId: caller.userId, readId: request.readId, pro })

  if (outcome.result === 'quota_exhausted') {
    recordPaywallHit(outcome.reason)
    logger.info('paywall', { reason: outcome.reason })
    return respondJson(responseStream, 402, {
      error: 'quota_exhausted',
      reason: outcome.reason,
      message:
        outcome.reason === 'free_reads'
          ? `You have used all ${FREE_READ_LIMIT} free reads.`
          : 'You have used all the free characters included with Pilcrow.',
    })
  }

  // Past the monthly allowance a Pro user is slowed, not stopped. Cutting off a
  // paying customer mid-article costs more in churn than the audio costs us.
  if (pro) {
    const used = await getMonthlyChars(caller.userId, currentPeriod())
    if (used >= PRO_MONTHLY_CHARS) {
      logger.info('throttling pro user past allowance', { used })
      await new Promise((resolve) => setTimeout(resolve, PRO_THROTTLE_DELAY_MS))
    }
  }

  const apiKey = await getElevenLabsKey()
  const url =
    `${config.elevenLabsBaseUrl}/text-to-speech/${encodeURIComponent(request.voiceId)}/stream` +
    `?output_format=${config.outputFormat}`

  const upstream = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'content-type': 'application/json',
      accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text: request.text,
      model_id: request.modelId,
      previous_text: request.previousText,
      next_text: request.nextText,
      voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: request.speed },
    }),
  })

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => '')
    // Log the upstream detail but never return it: it can contain our account
    // state, and the user can do nothing with it either way.
    logger.error('elevenlabs rejected the request', { status: upstream.status, detail: detail.slice(0, 500) })
    return respondJson(responseStream, upstream.status === 429 ? 429 : 502, {
      error: 'synthesis_failed',
      message:
        upstream.status === 429
          ? 'Pilcrow is at capacity for a moment. Try again shortly.'
          : 'The voice service could not read that text.',
    })
  }

  const out = awslambda.HttpResponseStream.from(responseStream, {
    statusCode: 200,
    headers: {
      'content-type': 'audio/mpeg',
      'x-pilcrow-chars': String(request.text.length),
      'cache-control': 'no-store',
    },
  })

  await pipeline(Readable.fromWeb(upstream.body as never), out)

  // Only after the bytes actually reached the client. A failed stream must not
  // count against anyone's allowance.
  await recordSynthesis({
    userId: caller.userId,
    readId: request.readId,
    chars: request.text.length,
    pro,
  })
  recordSynthesisMetrics({ chars: request.text.length, plan: pro ? 'pro' : 'free' })
}

export const handler = awslambda.streamifyResponse(async (event, responseStream) => {
  try {
    await handle(event, responseStream)
  } catch (error) {
    logger.error('unhandled error in tts handler', { error })
    if (!responseStream.writableEnded) {
      try {
        respondJson(responseStream, 500, { error: 'internal_error' })
      } catch {
        responseStream.end()
      }
    }
  }
})
