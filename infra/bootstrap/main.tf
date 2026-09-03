/**
 * Remote state has a chicken-and-egg problem: the bucket that holds the state
 * cannot itself be described in that state. So this directory uses LOCAL state,
 * is applied exactly once per AWS account, and is then left alone.
 *
 *   cd infra/bootstrap && terraform init && terraform apply
 *
 * Commit the resulting terraform.tfstate. It describes two resources that will
 * never change, and losing it is more annoying than the (empty) secret it holds.
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
}

variable "region" {
  type    = string
  default = "us-east-1"
}

variable "state_bucket" {
  type        = string
  description = "Globally unique. Suggested: pilcrow-tfstate-<aws account id>"
}

resource "aws_s3_bucket" "state" {
  bucket = var.state_bucket

  # Terraform state contains resource ids and occasionally secret values that
  # leaked in through outputs. Deleting it by accident is unrecoverable.
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket                  = aws_s3_bucket.state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# S3 native locking (use_lockfile) is available in provider 5.80+, but a DynamoDB
# lock table is still the compatible default and costs nothing at this volume.
resource "aws_dynamodb_table" "locks" {
  name         = "pilcrow-tf-locks"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }

  lifecycle {
    prevent_destroy = true
  }
}

output "state_bucket" {
  value = aws_s3_bucket.state.id
}

output "lock_table" {
  value = aws_dynamodb_table.locks.name
}

output "backend_config" {
  description = "Paste into infra/envs/*/backend.tf"
  value       = <<-EOT
    bucket         = "${aws_s3_bucket.state.id}"
    dynamodb_table = "${aws_dynamodb_table.locks.name}"
    region         = "${var.region}"
    encrypt        = true
  EOT
}
