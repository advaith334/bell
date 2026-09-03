import type { Context } from 'hono'
import type { LambdaEvent } from 'hono/aws-lambda'

/**
 * API Gateway's JWT authorizer has already verified the token by the time a
 * request reaches us — it rejects bad ones before invoking the Lambda at all. So
 * this reads claims, it does not validate them, and there is deliberately no
 * token-parsing code in the control plane.
 */

interface JwtAuthorizer {
  jwt?: { claims?: Record<string, string | number | boolean> }
}

export interface Caller {
  userId: string
  email?: string
  provider?: string
}

export function callerFrom(c: Context): Caller {
  const event = c.env?.event as LambdaEvent | undefined
  const claims = (event as { requestContext?: { authorizer?: JwtAuthorizer } } | undefined)
    ?.requestContext?.authorizer?.jwt?.claims

  if (!claims || typeof claims['sub'] !== 'string') {
    // Only reachable if a route is wired without the authorizer — a deploy bug,
    // not a user error, so it should be loud.
    throw new Error('No JWT claims on the request; is the authorizer attached to this route?')
  }

  const userId = claims['sub']
  const identities = claims['identities']
  return {
    userId,
    email: typeof claims['email'] === 'string' ? claims['email'] : undefined,
    provider:
      typeof claims['cognito:username'] === 'string' && claims['cognito:username'].includes('_')
        ? claims['cognito:username'].split('_')[0]
        : typeof identities === 'string'
          ? identities
          : undefined,
  }
}
