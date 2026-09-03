/**
 * Environment configuration. Read once at module load so a missing variable is a
 * cold-start failure with a clear message, rather than an undefined that surfaces
 * as a confusing DynamoDB error on the first real request.
 */

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable ${name}`)
  return value
}

function optional(name: string, fallback: string): string {
  return process.env[name] || fallback
}

export const config = {
  env: optional('PILCROW_ENV', 'dev'),
  region: optional('AWS_REGION', 'us-east-1'),

  tableName: required('TABLE_NAME'),

  /** Cognito, for verifying access tokens on the Function URL. */
  userPoolId: required('COGNITO_USER_POOL_ID'),
  userPoolClientId: required('COGNITO_CLIENT_ID'),

  /** Secrets Manager ARNs. Values are fetched lazily and cached per container. */
  elevenLabsSecretArn: required('ELEVENLABS_SECRET_ARN'),
  stripeSecretArn: optional('STRIPE_SECRET_ARN', ''),
  stripeWebhookSecretArn: optional('STRIPE_WEBHOOK_SECRET_ARN', ''),

  /** Where Stripe sends the customer after Checkout; deep-links back into the app. */
  webBaseUrl: optional('WEB_BASE_URL', 'https://pilcrow.app'),

  elevenLabsBaseUrl: 'https://api.elevenlabs.io/v1',
  outputFormat: 'mp3_44100_128',
} as const
