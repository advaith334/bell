/**
 * One DynamoDB table for everything: users and their entitlement, the per-read
 * ledger that makes quota consumption idempotent, monthly usage, and Stripe event
 * deduplication. ElectroDB (services/src/shared/entities.ts) owns the key shapes;
 * this file only has to know the attribute names it indexes on.
 */

resource "aws_dynamodb_table" "main" {
  name         = "pilcrow-${var.env}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }
  attribute {
    name = "sk"
    type = "S"
  }
  attribute {
    name = "gsi1pk"
    type = "S"
  }
  attribute {
    name = "gsi1sk"
    type = "S"
  }

  # The Stripe webhook knows a customer id, not a Cognito sub. Without this
  # index every webhook would be a full table scan.
  global_secondary_index {
    name            = "gsi1"
    hash_key        = "gsi1pk"
    range_key       = "gsi1sk"
    projection_type = "ALL"
  }

  # Read-ledger and Stripe-event items expire on their own; both exist only to
  # deduplicate something in flight.
  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = var.env == "prod"
  }

  server_side_encryption {
    enabled = true
  }

  deletion_protection_enabled = var.env == "prod"

  tags = var.tags
}
