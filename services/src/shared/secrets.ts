import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager'
import { config } from './config.js'

/**
 * Secrets are fetched once per Lambda container and cached in module scope.
 * Secrets Manager charges per API call and adds ~50ms; on a hot container this
 * makes the ElevenLabs key effectively free to read.
 *
 * Rotation therefore takes effect on the next cold start, not instantly. That is
 * the right trade for keys we rotate manually, and it is why the ElevenLabs key
 * is stored as a raw string rather than a JSON blob — one less thing to parse.
 */

const client = new SecretsManagerClient({ region: config.region })
const cache = new Map<string, Promise<string>>()

export function getSecret(arn: string): Promise<string> {
  const hit = cache.get(arn)
  if (hit) return hit

  const pending = client
    .send(new GetSecretValueCommand({ SecretId: arn }))
    .then((response) => {
      const value = response.SecretString
      if (!value) throw new Error(`Secret ${arn} has no string value`)
      return value
    })
    .catch((error: unknown) => {
      // Never cache a failure: a transient Secrets Manager blip would otherwise
      // poison the container for its entire lifetime.
      cache.delete(arn)
      throw error
    })

  cache.set(arn, pending)
  return pending
}

export const getElevenLabsKey = () => getSecret(config.elevenLabsSecretArn)
export const getStripeKey = () => getSecret(config.stripeSecretArn)
export const getStripeWebhookSecret = () => getSecret(config.stripeWebhookSecretArn)
