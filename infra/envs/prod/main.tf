/**
 * Production. The same modules as dev plus DNS, custom domains and real limits.
 *
 * Apply order on a fresh account is the same as dev, with two extra passes for
 * certificates — the domains cannot be attached until ACM has validated them,
 * and validation cannot happen until the zone exists and the registrar delegates
 * to it:
 *
 *   1. bootstrap, then `terraform apply -target=module.secrets`
 *   2. populate the secrets  (docs/INFRA-MANUAL-STEPS.md)
 *   3. `terraform apply -target=module.dns`   — creates and validates the certs
 *   4. `terraform apply`                      — everything, with domains attached
 *   5. `terraform apply` once more            — writes the alias records now that
 *                                               the targets exist
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

# CloudFront only accepts certificates from us-east-1, whatever region the rest
# of the stack lives in.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
  default_tags {
    tags = local.tags
  }
}

locals {
  env = "prod"
  tags = {
    Project     = "pilcrow"
    Environment = "prod"
    ManagedBy   = "terraform"
  }

  api_domain      = "api.${var.zone_name}"
  download_domain = "dl.${var.zone_name}"
}

module "dns" {
  source = "../../modules/dns"
  providers = {
    aws           = aws
    aws.us_east_1 = aws.us_east_1
  }

  zone_name       = var.zone_name
  api_domain      = local.api_domain
  download_domain = local.download_domain

  # Null on the first pass; filled in on the second, once the targets exist.
  api_target      = try(module.api.domain_target, null)
  download_target = try({ name = module.dist.distribution_domain_name, zone_id = module.dist.distribution_hosted_zone_id }, null)

  tags = local.tags
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
  callback_urls           = ["pilcrow://auth/callback"]
  logout_urls             = ["pilcrow://auth/signout"]

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

  web_base_url    = "https://${var.zone_name}"
  domain_name     = local.api_domain
  certificate_arn = module.dns.regional_certificate_arn

  log_retention_days = 90

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

  reserved_concurrency = var.tts_reserved_concurrency
  log_retention_days   = 90

  tags = local.tags
}

module "dist" {
  source = "../../modules/dist"
  env    = local.env

  bucket_name     = var.releases_bucket_name
  domain_name     = local.download_domain
  certificate_arn = module.dns.cloudfront_certificate_arn

  tags = local.tags
}

module "observability" {
  source = "../../modules/observability"
  env    = local.env
  region = var.region

  alert_emails      = var.alert_emails
  function_names    = [module.api.function_name, module.tts.function_name]
  tts_function_name = module.tts.function_name

  hourly_char_threshold = var.hourly_char_threshold
  monthly_budget_usd    = var.monthly_budget_usd

  tags = local.tags
}
