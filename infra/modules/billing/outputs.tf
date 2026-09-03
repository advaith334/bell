output "arns" {
  value = { for key, secret in aws_secretsmanager_secret.this : key => secret.arn }
}

output "all_arns" {
  description = "For the IAM policy that lets the Lambdas read them."
  value       = [for secret in aws_secretsmanager_secret.this : secret.arn]
}
