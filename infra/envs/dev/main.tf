/**
 * The dev stack. Everything except DNS and custom domains — dev talks to the raw
 * API Gateway and Function URLs, which keeps the first-ever apply from being
 * blocked on domain registration and certificate validation.
 *
 * Apply order on a fresh account:
 *   1. cd ../../bootstrap && terraform apply      (once per account)
 *   2. cd services && npm run build               (produces the Lambda zips)
 *   3. terraform apply -target=module.secrets     (creates the empty containers)
 *   4. populate the secrets by hand (docs/INFRA-MANUAL-STEPS.md)
 *   5. terraform apply                            (the rest)
 *
 * Step 3 is separate because module.auth reads the Google and Apple secrets at
 * plan time — it cannot be created in the same pass that creates the containers.
 */

terraform {
  required_version = ">= 1.9"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.80"
    }
  }
}

provider "aws" {
  region = var.region
  default_tags {
    tags = local.tags
  }
}

locals {
  env = "dev"
  tags = {
    Project     = "pilcrow"
    Environment = "dev"
    ManagedBy   = "terraform"
  }
}

module "secrets" {
  source = "../../modules/billing"
  env    = local.env
  tags   = local.tags
}

module "data" {
  source = "../../modules/data"
  env    = local.env
  tags   = local.tags
}

module "auth" {
  source = "../../modules/auth"
  env    = local.env

  hosted_ui_domain_prefix = var.hosted_ui_domain_prefix

  # The custom scheme is how the browser hands the authorization code back to a
  # desktop app. The http://localhost entry is for `npm start`, where macOS
  # registers the Electron binary rather than Pilcrow for the scheme.
  callback_urls = ["pilcrow://auth/callback", "http://localhost:8788/auth/callback"]
  logout_urls   = ["pilcrow://auth/signout", "http://localhost:8788/auth/signout"]

  google_secret_arn = module.secrets.arns["google-oauth"]
  apple_secret_arn  = module.secrets.arns["apple-oauth"]

  tags = local.tags
}

module "api" {
  source       = "../../modules/api"
  env          = local.env
  package_path = "${path.module}/../../../services/dist/api.zip"

  table_name       = module.data.table_name
  table_arn        = module.data.table_arn
  table_index_arns = module.data.index_arns

  user_pool_id        = module.auth.user_pool_id
  user_pool_client_id = module.auth.client_id
  issuer              = module.auth.issuer

  secret_arns               = module.secrets.all_arns
  elevenlabs_secret_arn     = module.secrets.arns["elevenlabs"]
  stripe_secret_arn         = module.secrets.arns["stripe"]
  stripe_webhook_secret_arn = module.secrets.arns["stripe-webhook"]

  web_base_url       = var.web_base_url
  log_retention_days = 7

  tags = local.tags
}

module "tts" {
  source       = "../../modules/tts"
  env          = local.env
  package_path = "${path.module}/../../../services/dist/tts.zip"

  table_name       = module.data.table_name
  table_arn        = module.data.table_arn
  table_index_arns = module.data.index_arns

  user_pool_id        = module.auth.user_pool_id
  user_pool_client_id = module.auth.client_id

  elevenlabs_secret_arn = module.secrets.arns["elevenlabs"]

  # Dev should never be able to spend meaningful money.
  reserved_concurrency = 5
  log_retention_days   = 7

  tags = local.tags
}

module "observability" {
  source = "../../modules/observability"
  env    = local.env
  region = var.region

  alert_emails      = var.alert_emails
  function_names    = [module.api.function_name, module.tts.function_name]
  tts_function_name = module.tts.function_name

  # 100k chars/hour is $5 — plenty for one developer, and loud if a loop escapes.
  hourly_char_threshold = 100000
  monthly_budget_usd    = "50"

  tags = local.tags
}
