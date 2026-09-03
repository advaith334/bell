/**
 * Secret CONTAINERS only. Terraform creates them with a placeholder and then
 * deliberately ignores the value forever, so that:
 *
 *   - no real credential is ever written to a .tf file or a tfvars,
 *   - rotating a key by hand or in CI does not show up as Terraform drift,
 *   - and `terraform apply` can never clobber a live key with a placeholder.
 *
 * Populate them once, after the first apply:
 *
 *   aws secretsmanager put-secret-value --secret-id pilcrow-<env>-elevenlabs \
 *     --secret-string 'sk_...'
 *
 * See docs/INFRA-MANUAL-STEPS.md for the shape each one expects.
 */

locals {
  secrets = {
    elevenlabs = {
      description = "ElevenLabs API key. Raw string, not JSON."
      placeholder = "REPLACE_ME"
    }
    stripe = {
      description = "Stripe secret key (sk_live_... or sk_test_...). Raw string."
      placeholder = "REPLACE_ME"
    }
    stripe-webhook = {
      description = "Stripe webhook signing secret (whsec_...). Raw string."
      placeholder = "REPLACE_ME"
    }
    google-oauth = {
      description = "Google OAuth client for Cognito."
      placeholder = jsonencode({ client_id = "REPLACE_ME", client_secret = "REPLACE_ME" })
    }
    apple-oauth = {
      description = "Sign in with Apple: Services ID, team, key id and the .p8 private key."
      placeholder = jsonencode({
        services_id = "REPLACE_ME"
        team_id     = "REPLACE_ME"
        key_id      = "REPLACE_ME"
        private_key = "REPLACE_ME"
      })
    }
  }
}

resource "aws_secretsmanager_secret" "this" {
  for_each = local.secrets

  name        = "pilcrow-${var.env}-${each.key}"
  description = each.value.description

  # A short window in dev so a mistaken destroy can be redone the same day;
  # the maximum in prod so a mistake is recoverable for a month.
  recovery_window_in_days = var.env == "prod" ? 30 : 7

  tags = var.tags
}

resource "aws_secretsmanager_secret_version" "placeholder" {
  for_each = local.secrets

  secret_id     = aws_secretsmanager_secret.this[each.key].id
  secret_string = each.value.placeholder

  # The whole point. Real values are put in out of band and must survive apply.
  lifecycle {
    ignore_changes = [secret_string]
  }
}
