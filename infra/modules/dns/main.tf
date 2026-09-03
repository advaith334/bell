/**
 * DNS and certificates.
 *
 * The apex and www are NOT managed here — they point at Vercel, which asks for
 * its own records, and having Terraform fight the Vercel dashboard over them
 * would be a recurring annoyance for no benefit. This module owns the subdomains
 * that belong to AWS: api. and dl.
 *
 * Two certificates are needed because CloudFront only accepts certificates from
 * us-east-1, while API Gateway needs one in its own region. If the stack is
 * deployed in us-east-1 these are the same thing, but the aliased provider keeps
 * that from being an accident.
 */

data "aws_route53_zone" "main" {
  name         = var.zone_name
  private_zone = false
}

resource "aws_acm_certificate" "regional" {
  domain_name       = var.api_domain
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = var.tags
}

resource "aws_acm_certificate" "cloudfront" {
  provider = aws.us_east_1

  domain_name       = var.download_domain
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = var.tags
}

locals {
  validations = merge(
    { for option in aws_acm_certificate.regional.domain_validation_options :
      "regional-${option.domain_name}" => option
    },
    { for option in aws_acm_certificate.cloudfront.domain_validation_options :
      "cloudfront-${option.domain_name}" => option
    },
  )
}

resource "aws_route53_record" "validation" {
  for_each = local.validations

  zone_id         = data.aws_route53_zone.main.zone_id
  name            = each.value.resource_record_name
  type            = each.value.resource_record_type
  records         = [each.value.resource_record_value]
  ttl             = 60
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "regional" {
  certificate_arn = aws_acm_certificate.regional.arn
  validation_record_fqdns = [
    for key, record in aws_route53_record.validation : record.fqdn if startswith(key, "regional-")
  ]
}

resource "aws_acm_certificate_validation" "cloudfront" {
  provider = aws.us_east_1

  certificate_arn = aws_acm_certificate.cloudfront.arn
  validation_record_fqdns = [
    for key, record in aws_route53_record.validation : record.fqdn if startswith(key, "cloudfront-")
  ]
}

# ---------------------------------------------------------------------------
# Alias records. Created only once the targets exist, which is why they are
# optional inputs — the first apply creates certificates, the second wires them.
# ---------------------------------------------------------------------------

resource "aws_route53_record" "api" {
  count = var.api_target == null ? 0 : 1

  zone_id = data.aws_route53_zone.main.zone_id
  name    = var.api_domain
  type    = "A"

  alias {
    name                   = var.api_target.name
    zone_id                = var.api_target.zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "download" {
  count = var.download_target == null ? 0 : 1

  zone_id = data.aws_route53_zone.main.zone_id
  name    = var.download_domain
  type    = "A"

  alias {
    name                   = var.download_target.name
    zone_id                = var.download_target.zone_id
    evaluate_target_health = false
  }
}
