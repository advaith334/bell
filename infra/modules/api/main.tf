/**
 * The control plane: an HTTP API in front of one Hono Lambda.
 *
 * Authentication is entirely declarative. API Gateway's JWT authorizer verifies
 * the Cognito access token and rejects bad ones before the Lambda is invoked, so
 * there is no token-handling code in services/src/api at all. The Stripe webhook
 * is the single route with the authorizer switched off — it authenticates by
 * signature instead, which is checked inside the handler.
 */

locals {
  name = "pilcrow-api-${var.env}"
}

# ---------------------------------------------------------------------------
# IAM
# ---------------------------------------------------------------------------

data "aws_iam_policy_document" "assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda" {
  name               = local.name
  assume_role_policy = data.aws_iam_policy_document.assume.json
  tags               = var.tags
}

data "aws_iam_policy_document" "lambda" {
  statement {
    sid    = "Logs"
    effect = "Allow"
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = ["${aws_cloudwatch_log_group.lambda.arn}:*"]
  }

  statement {
    sid    = "Table"
    effect = "Allow"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem",
      "dynamodb:Query",
      "dynamodb:TransactWriteItems",
      "dynamodb:TransactGetItems",
    ]
    # The GSI needs its own entry: a table ARN does not imply its indexes.
    resources = concat([var.table_arn], var.table_index_arns)
  }

  statement {
    sid       = "Secrets"
    effect    = "Allow"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = var.secret_arns
  }
}

resource "aws_iam_role_policy" "lambda" {
  name   = local.name
  role   = aws_iam_role.lambda.id
  policy = data.aws_iam_policy_document.lambda.json
}

# ---------------------------------------------------------------------------
# Function
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/${local.name}"
  retention_in_days = var.log_retention_days
  tags              = var.tags
}

resource "aws_lambda_function" "api" {
  function_name = local.name
  role          = aws_iam_role.lambda.arn

  filename         = var.package_path
  source_code_hash = filebase64sha256(var.package_path)

  runtime = "nodejs22.x"
  handler = "index.handler"

  # Stripe and Secrets Manager calls dominate; more memory buys proportionally
  # more CPU and shortens cold start, which is worth more than the cost here.
  memory_size = 512
  timeout     = 15

  environment {
    variables = merge(
      {
        PILCROW_ENV                = var.env
        TABLE_NAME                 = var.table_name
        COGNITO_USER_POOL_ID       = var.user_pool_id
        COGNITO_CLIENT_ID          = var.user_pool_client_id
        ELEVENLABS_SECRET_ARN      = var.elevenlabs_secret_arn
        STRIPE_SECRET_ARN          = var.stripe_secret_arn
        STRIPE_WEBHOOK_SECRET_ARN  = var.stripe_webhook_secret_arn
        WEB_BASE_URL               = var.web_base_url
        NODE_OPTIONS               = "--enable-source-maps"
        POWERTOOLS_SERVICE_NAME    = "pilcrow-api"
        POWERTOOLS_METRICS_NAMESPACE = "Pilcrow"
      },
      var.extra_environment,
    )
  }

  depends_on = [aws_cloudwatch_log_group.lambda]
  tags       = var.tags
}

resource "aws_lambda_permission" "api_gateway" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}

# ---------------------------------------------------------------------------
# HTTP API
# ---------------------------------------------------------------------------

resource "aws_apigatewayv2_api" "main" {
  name          = local.name
  protocol_type = "HTTP"

  # CORS is also set in Hono. Setting it here too means preflights are answered
  # by API Gateway without a Lambda invocation.
  cors_configuration {
    allow_origins = [var.web_base_url]
    allow_methods = ["GET", "POST", "OPTIONS"]
    allow_headers = ["authorization", "content-type"]
    max_age       = 3600
  }

  tags = var.tags
}

resource "aws_apigatewayv2_authorizer" "jwt" {
  api_id           = aws_apigatewayv2_api.main.id
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]
  name             = "cognito"

  jwt_configuration {
    # The access token's audience is the client id; Cognito puts it in
    # `client_id` rather than `aud`, which API Gateway understands.
    audience = [var.user_pool_client_id]
    issuer   = var.issuer
  }
}

resource "aws_apigatewayv2_integration" "lambda" {
  api_id                 = aws_apigatewayv2_api.main.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.api.invoke_arn
  payload_format_version = "2.0"
}

locals {
  authenticated_routes = [
    "GET /me",
    "GET /voices",
    "POST /billing/checkout",
    "POST /billing/portal",
  ]

  # No authorizer: Stripe cannot present a Cognito token, and the webhook's
  # signature is what authenticates it. `/health` is deliberately open so an
  # uptime check does not need credentials.
  public_routes = [
    "POST /stripe/webhook",
    "GET /health",
  ]
}

resource "aws_apigatewayv2_route" "authenticated" {
  for_each = toset(local.authenticated_routes)

  api_id             = aws_apigatewayv2_api.main.id
  route_key          = each.value
  target             = "integrations/${aws_apigatewayv2_integration.lambda.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
}

resource "aws_apigatewayv2_route" "public" {
  for_each = toset(local.public_routes)

  api_id             = aws_apigatewayv2_api.main.id
  route_key          = each.value
  target             = "integrations/${aws_apigatewayv2_integration.lambda.id}"
  authorization_type = "NONE"
}

resource "aws_cloudwatch_log_group" "access" {
  name              = "/aws/apigateway/${local.name}"
  retention_in_days = var.log_retention_days
  tags              = var.tags
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.main.id
  name        = "$default"
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.access.arn
    format = jsonencode({
      requestId      = "$context.requestId"
      ip             = "$context.identity.sourceIp"
      routeKey       = "$context.routeKey"
      status         = "$context.status"
      responseLength = "$context.responseLength"
      latency        = "$context.responseLatency"
      userId         = "$context.authorizer.claims.sub"
      integrationErr = "$context.integrationErrorMessage"
    })
  }

  default_route_settings {
    # A per-user rate limit would be better, but API Gateway only offers this at
    # the stage level without usage plans (which HTTP APIs do not have). Real
    # per-user limiting lives in the TTS function, where the money is.
    throttling_burst_limit = var.throttle_burst
    throttling_rate_limit  = var.throttle_rate
  }

  tags = var.tags
}

# ---------------------------------------------------------------------------
# Custom domain (optional — skipped until the certificate exists)
# ---------------------------------------------------------------------------

resource "aws_apigatewayv2_domain_name" "main" {
  count = var.domain_name == "" ? 0 : 1

  domain_name = var.domain_name

  domain_name_configuration {
    certificate_arn = var.certificate_arn
    endpoint_type   = "REGIONAL"
    security_policy = "TLS_1_2"
  }

  tags = var.tags
}

resource "aws_apigatewayv2_api_mapping" "main" {
  count = var.domain_name == "" ? 0 : 1

  api_id      = aws_apigatewayv2_api.main.id
  domain_name = aws_apigatewayv2_domain_name.main[0].id
  stage       = aws_apigatewayv2_stage.default.id
}
