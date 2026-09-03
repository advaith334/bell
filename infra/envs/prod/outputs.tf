output "client_env" {
  description = "Goes into the desktop app's build-time configuration."
  value = {
    PILCROW_API_URL        = module.api.api_url
    PILCROW_TTS_URL        = module.tts.function_url
    PILCROW_COGNITO_ISSUER = module.auth.issuer
    PILCROW_COGNITO_CLIENT = module.auth.client_id
    PILCROW_HOSTED_UI      = module.auth.hosted_ui_domain
  }
}

output "web_env" {
  description = "Goes into the Vercel project's environment variables."
  value = {
    NEXT_PUBLIC_DOWNLOAD_URL = "${module.dist.download_base_url}/Pilcrow.dmg"
    NEXT_PUBLIC_API_URL      = module.api.api_url
  }
}

output "release_target" {
  description = "Where `npm run release` uploads to, and what to invalidate afterwards."
  value = {
    bucket          = module.dist.bucket_name
    distribution_id = module.dist.distribution_id
  }
}

output "stripe_webhook_url" {
  value = module.api.webhook_url
}

output "secret_ids" {
  value = module.secrets.arns
}
