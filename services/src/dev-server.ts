import { serve } from '@hono/node-server'
import { app } from './api/app.js'

/**
 * Runs the control plane locally so `stripe listen --forward-to
 * localhost:8787/stripe/webhook` can exercise the webhook path against real
 * Stripe events, which is the only way to be confident about it before deploy.
 *
 * There is no JWT authorizer here, so `callerFrom` would throw on the
 * authenticated routes. DEV_USER_ID fakes the claims API Gateway would inject.
 */

const port = Number(process.env.PORT ?? 8787)

if (process.env.DEV_USER_ID) {
  app.use('*', async (c, next) => {
    c.env = {
      ...(c.env ?? {}),
      event: {
        requestContext: {
          authorizer: {
            jwt: { claims: { sub: process.env.DEV_USER_ID, email: process.env.DEV_EMAIL ?? '' } },
          },
        },
      },
    }
    await next()
  })
}

serve({ fetch: app.fetch, port })
console.log(`pilcrow api on http://localhost:${port}`)
