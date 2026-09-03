/**
 * Cognito is doing a lot of work here that we would otherwise write ourselves:
 * the Apple and Google token exchanges, JWT issuance and rotation, the JWKS
 * endpoint, refresh tokens, and a hosted sign-in page that satisfies Apple's
 * requirement that Sign in with Apple happen in a real browser rather than an
 * embedded webview.
 *
 * The desktop app opens the hosted UI with `shell.openExternal` and gets the code
 * back through the `pilcrow://` deep link, using PKCE with no client secret —
 * which is correct for a public client, since anything shipped in an .app is
 * readable by anyone who downloads it.
 */

resource "aws_cognito_user_pool" "main" {
  name = "pilcrow-${var.env}"

  # Federated-only: there are no passwords in this system, so there is nothing to
  # leak, reset, or rate-limit.
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  schema {
    name                     = "email"
    attribute_data_type      = "String"
    required                 = true
    mutable                  = true
    developer_only_attribute = false

    string_attribute_constraints {
      min_length = 3
      max_length = 320
    }
  }

  user_attribute_update_settings {
    attributes_require_verification_before_update = ["email"]
  }

  admin_create_user_config {
    allow_admin_create_user_only = false
  }

  deletion_protection = var.env == "prod" ? "ACTIVE" : "INACTIVE"

  tags = var.tags
}

resource "aws_cognito_user_pool_domain" "main" {
  # Apple's return URL must match this exactly, and changing it invalidates every
  # existing session — so it is worth getting right once.
  domain       = var.hosted_ui_domain_prefix
  user_pool_id = aws_cognito_user_pool.main.id
}

# ---------------------------------------------------------------------------
# Identity providers
#
# Credentials live in Secrets Manager and are put there by hand (see
# docs/INFRA-MANUAL-STEPS.md). They are read here rather than passed as variables
# so they never appear in a tfvars file — though note they DO land in Terraform
# state, which is why the state bucket is encrypted and access-restricted.
# ---------------------------------------------------------------------------

data "aws_secretsmanager_secret_version" "google" {
  secret_id = var.google_secret_arn
}

data "aws_secretsmanager_secret_version" "apple" {
  secret_id = var.apple_secret_arn
}

locals {
  google = jsondecode(data.aws_secretsmanager_secret_version.google.secret_string)
  apple  = jsondecode(data.aws_secretsmanager_secret_version.apple.secret_string)
}

resource "aws_cognito_identity_provider" "google" {
  user_pool_id  = aws_cognito_user_pool.main.id
  provider_name = "Google"
  provider_type = "Google"

  provider_details = {
    client_id        = local.google["client_id"]
    client_secret    = local.google["client_secret"]
    authorize_scopes = "openid email profile"
  }

  attribute_mapping = {
    email    = "email"
    username = "sub"
    name     = "name"
  }
}

resource "aws_cognito_identity_provider" "apple" {
  user_pool_id  = aws_cognito_user_pool.main.id
  provider_name = "SignInWithApple"
  provider_type = "SignInWithApple"

  provider_details = {
    # For Apple the "client id" is a Services ID, not an App ID — a common and
    # very confusing first mistake.
    client_id        = local.apple["services_id"]
    team_id          = local.apple["team_id"]
    key_id           = local.apple["key_id"]
    private_key      = local.apple["private_key"]
    authorize_scopes = "email name"
  }

  attribute_mapping = {
    email    = "email"
    username = "sub"
  }
}

resource "aws_cognito_user_pool_client" "desktop" {
  name         = "pilcrow-desktop-${var.env}"
  user_pool_id = aws_cognito_user_pool.main.id

  # A public client: an .app bundle cannot keep a secret, so PKCE is the security
  # boundary instead.
  generate_secret = false

  allowed_oauth_flows                  = ["code"]
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_scopes                 = ["openid", "email", "profile"]

  supported_identity_providers = [
    aws_cognito_identity_provider.google.provider_name,
    aws_cognito_identity_provider.apple.provider_name,
  ]

  callback_urls = var.callback_urls
  logout_urls   = var.logout_urls

  # Access tokens are short so a leaked one ages out quickly; the refresh token
  # is what actually keeps someone signed in, and it is stored in the Keychain
  # via Electron's safeStorage.
  access_token_validity  = 60
  id_token_validity      = 60
  refresh_token_validity = 30

  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }

  # Rotating the refresh token on every use means a stolen one is single-shot.
  enable_token_revocation       = true
  prevent_user_existence_errors = "ENABLED"

  explicit_auth_flows = ["ALLOW_REFRESH_TOKEN_AUTH"]

  read_attributes  = ["email", "email_verified", "name"]
  write_attributes = ["email", "name"]
}
