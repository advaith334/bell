import { z } from 'zod'
import { MAX_CHARS_PER_REQUEST } from './plans.js'

/**
 * Every request body and every response shape, validated at the boundary. The
 * response schemas exist so the Electron client can import the same shapes and
 * parse rather than cast — a backend change that breaks the app should fail
 * loudly at the seam, not three frames deeper in the audio renderer.
 */

export const synthesizeRequestSchema = z.object({
  /** The client's utterance id. One read, however many chunks. */
  readId: z.string().uuid(),
  chunkIndex: z.number().int().min(0).max(500),
  text: z.string().min(1).max(MAX_CHARS_PER_REQUEST),
  voiceId: z.string().min(1).max(64),
  modelId: z.enum(['eleven_flash_v2_5', 'eleven_turbo_v2_5', 'eleven_multilingual_v2']),
  speed: z.number().min(0.7).max(1.2),
  /** Context for prosody across chunk seams; not synthesized, so not billed. */
  previousText: z.string().max(MAX_CHARS_PER_REQUEST).optional(),
  nextText: z.string().max(MAX_CHARS_PER_REQUEST).optional(),
})

export type SynthesizeRequest = z.infer<typeof synthesizeRequestSchema>

export const entitlementSchema = z.object({
  plan: z.enum(['free', 'pro']),
  status: z.string(),
  isActive: z.boolean(),
  currentPeriodEnd: z.number().nullable(),
  readsRemaining: z.number().nullable(),
  freeReadsUsed: z.number(),
  freeCharsUsed: z.number(),
  monthlyChars: z.number(),
  monthlyCharsIncluded: z.number().nullable(),
  throttled: z.boolean(),
})

export const accountSchema = z.object({
  userId: z.string(),
  email: z.string().nullable(),
  entitlement: entitlementSchema,
  limits: z.object({
    freeReadLimit: z.number(),
    freeCharLimit: z.number(),
    maxCharsPerRequest: z.number(),
  }),
})

export type Account = z.infer<typeof accountSchema>

export const voiceSchema = z.object({
  voiceId: z.string(),
  name: z.string(),
  previewUrl: z.string().optional(),
})

export const voicesResponseSchema = z.object({ voices: z.array(voiceSchema) })

export const checkoutResponseSchema = z.object({ url: z.string().url() })

/**
 * The 402 body. `reason` is what lets the client say "you have used your twenty
 * free reads" instead of a generic failure, and lets it distinguish a paywall
 * from a network problem.
 */
export const quotaErrorSchema = z.object({
  error: z.literal('quota_exhausted'),
  reason: z.enum(['free_reads', 'free_chars']),
  message: z.string(),
})
