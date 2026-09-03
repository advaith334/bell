output "invoke_url" {
  value = aws_apigatewayv2_stage.default.invoke_url
}

output "api_url" {
  description = "What the desktop app should be pointed at."
  value       = var.domain_name == "" ? aws_apigatewayv2_stage.default.invoke_url : "https://${var.domain_name}"
}

output "webhook_url" {
  description = "Paste this into the Stripe dashboard to create the endpoint."
  value       = "${var.domain_name == "" ? aws_apigatewayv2_stage.default.invoke_url : "https://${var.domain_name}"}/stripe/webhook"
}

output "domain_target" {
  description = "For the Route 53 alias record."
  value = var.domain_name == "" ? null : {
    name    = aws_apigatewayv2_domain_name.main[0].domain_name_configuration[0].target_domain_name
    zone_id = aws_apigatewayv2_domain_name.main[0].domain_name_configuration[0].hosted_zone_id
  }
}

output "function_name" {
  value = aws_lambda_function.api.function_name
}
