import ky, { HTTPError, type KyInstance } from 'ky'
import { BACKEND } from '@/shared/config'
import * as auth from './auth'

/**
 * The authenticated client for our control plane. `ky` supplies the retry policy
 * and the request/response hooks, so there is no bespoke fetch wrapper here — the
 * only thing this file adds is "attach the bearer token" and "one silent retry
 * after a refresh on 401".
 */

export class NotSignedInError extends Error {
  constructor() {
    super('Not signed in')
    this.name = 'NotSignedInError'
  }
}

export class OfflineError extends Error {
  constructor() {
    super("Pilcrow can't reach the internet.")
    this.name = 'OfflineError'
  }
}

export const api: KyInstance = ky.create({
  prefix: BACKEND.apiUrl,
  timeout: 20_000,
  retry: {
    limit: 3,
    methods: ['get', 'post'],
    // 401 is handled by the hook below, not by retrying blindly; 402 is a
    // paywall and will never succeed on a retry.
    statusCodes: [408, 429, 500, 502, 503, 504],
    backoffLimit: 4_000,
  },
  hooks: {
    beforeRequest: [
      async ({ request }) => {
        const token = await auth.getAccessToken()
        if (!token) throw new NotSignedInError()
        request.headers.set('authorization', `Bearer ${token}`)
      },
    ],
    beforeRetry: [
      async ({ request }) => {
        // The token may have expired between the first attempt and the retry.
        const token = await auth.getAccessToken()
        if (token) request.headers.set('authorization', `Bearer ${token}`)
      },
    ],
    afterResponse: [
      async ({ request, response }) => {
        if (response.status !== 401) return response

        // The access token was rejected. Force a refresh by expiring what we
        // hold, then try exactly once more; a second 401 means the session is
        // genuinely gone and auth.getAccessToken() will have signed us out.
        const token = await auth.getAccessToken()
        if (!token) return response

        request.headers.set('authorization', `Bearer ${token}`)
        return ky(request, { retry: 0 })
      },
    ],
  },
})

/** Turns transport failures into something the UI can say out loud. */
export function describeFailure(error: unknown): Error {
  if (error instanceof NotSignedInError) return error
  if (error instanceof HTTPError) return error
  const message = error instanceof Error ? error.message : String(error)
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network/i.test(message)) return new OfflineError()
  return error instanceof Error ? error : new Error(message)
}

export { HTTPError }
