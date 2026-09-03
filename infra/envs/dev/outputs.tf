/**
 * These are exactly the values the desktop app and the website need. After an
 * apply, `terraform output -json client_env` produces the .env for both.
 */

output "client_env" {
  value = {
    PILCROW_API_URL        = module.api.api_url
    PILCROW_TTS_URL        = module.tts.function_url
    PILCROW_COGNITO_ISSUER = module.auth.issuer
    PILCROW_COGNITO_CLIENT = module.auth.client_id
    PILCROW_HOSTED_UI      = module.auth.hosted_ui_domain
  }
}

output "stripe_webhook_url" {
  description = "Create the endpoint in the Stripe dashboard against this, then put its signing secret in the pilcrow-dev-stripe-webhook secret."
  value       = module.api.webhook_url
}

output "secret_ids" {
  description = "Populate each of these before the first real request."
  value       = module.secrets.arns
}
