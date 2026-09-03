output "zone_id" {
  value = data.aws_route53_zone.main.zone_id
}

output "regional_certificate_arn" {
  value = aws_acm_certificate_validation.regional.certificate_arn
}

output "cloudfront_certificate_arn" {
  value = aws_acm_certificate_validation.cloudfront.certificate_arn
}
