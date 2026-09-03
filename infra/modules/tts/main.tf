/**
 * The audio proxy: a Lambda Function URL with response streaming, no API Gateway.
 *
 * Function URLs return raw bytes. API Gateway would base64-encode every mp3 —
 * a 33% tax against a 6MB response ceiling — and buffer it whole before sending
 * anything. Streaming avoids both, and it is the path to progressive playback
 * later without changing the transport.
 *
 * `authorization_type = NONE` on the URL does NOT mean the endpoint is open. It
 * means IAM SigV4 is not the mechanism; the handler verifies the Cognito access
 * token with aws-jwt-verify on every request. IAM auth is not usable here because
 * the caller is a desktop app holding a user token, not an AWS principal.
 */

locals {
  name = "pilcrow-tts-${var.env}"
}

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
    sid       = "Logs"
    effect    = "Allow"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.lambda.arn}:*"]
  }

  statement {
    sid    = "Table"
    effect = "Allow"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:Query",
      "dynamodb:TransactWriteItems",
    ]
    resources = concat([var.table_arn], var.table_index_arns)
  }

  statement {
    sid       = "ElevenLabsKey"
    effect    = "Allow"
    actions   = ["secretsmanager:GetSecretValue"]
    # Deliberately only the one secret. This function has no business reading
    # the Stripe keys, and a bug here should not be able to.
    resources = [var.elevenlabs_secret_arn]
  }
}

resource "aws_iam_role_policy" "lambda" {
  name   = local.name
  role   = aws_iam_role.lambda.id
  policy = data.aws_iam_policy_document.lambda.json
}

resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/${local.name}"
  retention_in_days = var.log_retention_days
  tags              = var.tags
}

resource "aws_lambda_function" "tts" {
  function_name = local.name
  role          = aws_iam_role.lambda.arn

  filename         = var.package_path
  source_code_hash = filebase64sha256(var.package_path)

  runtime = "nodejs22.x"
  handler = "index.handler"

  # This function spends nearly all its wall time waiting on ElevenLabs, so extra
  # memory buys nothing but faster cold starts and JWKS parsing.
  memory_size = 512
  # Generous: a 5,000-character chunk at the slowest model can take a while, and
  # a timeout mid-stream is a worse experience than waiting.
  timeout = 120

  # The blast-radius cap. A runaway client loop is bounded by this multiplied by
  # the per-request character limit — without it, a bug could spend thousands of
  # dollars of ElevenLabs credit before anyone noticed.
  reserved_concurrent_executions = var.reserved_concurrency

  environment {
    variables = {
      PILCROW_ENV                  = var.env
      TABLE_NAME                   = var.table_name
      COGNITO_USER_POOL_ID         = var.user_pool_id
      COGNITO_CLIENT_ID            = var.user_pool_client_id
      ELEVENLABS_SECRET_ARN        = var.elevenlabs_secret_arn
      NODE_OPTIONS                 = "--enable-source-maps"
      POWERTOOLS_SERVICE_NAME      = "pilcrow-tts"
      POWERTOOLS_METRICS_NAMESPACE = "Pilcrow"
    }
  }

  depends_on = [aws_cloudwatch_log_group.lambda]
  tags       = var.tags
}

resource "aws_lambda_function_url" "tts" {
  function_name      = aws_lambda_function.tts.function_name
  authorization_type = "NONE"
  invoke_mode        = "RESPONSE_STREAM"

  cors {
    allow_origins = ["*"]
    allow_methods = ["POST"]
    allow_headers = ["authorization", "content-type"]
    max_age       = 3600
  }
}
