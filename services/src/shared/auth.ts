import { CognitoJwtVerifier } from 'aws-jwt-verify'
import { config } from './config.js'

/**
 * Token verification for the TTS Function URL, which has no API Gateway in front
 * of it to do this declaratively. `aws-jwt-verify` is AWS's own library: it
 * fetches and caches the JWKS, checks signature, issuer, audience, expiry and
 * token_use. None of that is worth reimplementing.
 *
 * The control plane does NOT use this — API Gateway's built-in JWT authorizer
 * handles those routes, so `services/api` contains no auth code at all.
 */

const verifier = CognitoJwtVerifier.create({
  userPoolId: config.userPoolId,
  tokenUse: 'access',
  clientId: config.userPoolClientId,
})

export interface Caller {
  userId: string
  scopes: string[]
}

export class UnauthorizedError extends Error {
  constructor(message = 'Unauthorized') {
    super(message)
    this.name = 'UnauthorizedError'
  }
}

export async function verifyAuthorization(header: string | undefined): Promise<Caller> {
  if (!header?.startsWith('Bearer ')) throw new UnauthorizedError('Missing bearer token')

  try {
    const payload = await verifier.verify(header.slice('Bearer '.length))
    return {
      userId: payload.sub,
      scopes: typeof payload.scope === 'string' ? payload.scope.split(' ') : [],
    }
  } catch (error) {
    // Never echo the verifier's message back to the client: it distinguishes
    // "expired" from "wrong signature", which is a small oracle.
    throw new UnauthorizedError()
  }
}

/** Warms the JWKS cache during init, so the first real request is not slower than the rest. */
export const jwksReady = verifier.hydrate().catch(() => undefined)
