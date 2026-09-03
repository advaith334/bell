output "table_name" {
  value = aws_dynamodb_table.main.name
}

output "table_arn" {
  value = aws_dynamodb_table.main.arn
}

output "index_arns" {
  description = "GSIs need their own IAM resource entries; the table ARN alone does not cover them."
  value       = ["${aws_dynamodb_table.main.arn}/index/*"]
}
