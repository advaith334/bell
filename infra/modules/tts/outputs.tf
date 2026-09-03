output "function_url" {
  description = "What the desktop app POSTs each chunk to."
  value       = aws_lambda_function_url.tts.function_url
}

output "function_name" {
  value = aws_lambda_function.tts.function_name
}

output "function_arn" {
  value = aws_lambda_function.tts.arn
}
