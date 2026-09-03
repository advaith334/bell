/**
 * Alarms that exist because of the specific way this business can fail.
 *
 * The one that matters most is SynthesisVolume. Every character we synthesize is
 * money owed to ElevenLabs at $0.05/1,000, and the gap between "healthy growth"
 * and "someone is looping the hotkey" is invisible in every other metric. The
 * threshold should be set from real usage after a week, not guessed.
 */

resource "aws_sns_topic" "alerts" {
  name = "pilcrow-alerts-${var.env}"
  tags = var.tags
}

resource "aws_sns_topic_subscription" "email" {
  for_each = toset(var.alert_emails)

  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = each.value
  # Note: each address must confirm by clicking the link AWS emails them.
  # Terraform will show this subscription as "pending confirmation" until they do.
}

resource "aws_cloudwatch_metric_alarm" "synthesis_volume" {
  alarm_name          = "pilcrow-${var.env}-synthesis-volume"
  alarm_description   = "Characters synthesized per hour is far above normal — possible runaway client or abuse."
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  threshold           = var.hourly_char_threshold
  treat_missing_data  = "notBreaching"

  metric_name = "CharsSynthesized"
  namespace   = "Pilcrow"
  statistic   = "Sum"
  period      = 3600

  alarm_actions = [aws_sns_topic.alerts.arn]
  tags          = var.tags
}

resource "aws_cloudwatch_metric_alarm" "lambda_errors" {
  for_each = toset(var.function_names)

  alarm_name          = "pilcrow-${var.env}-${each.value}-errors"
  alarm_description   = "Lambda ${each.value} is throwing."
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  threshold           = 5
  treat_missing_data  = "notBreaching"

  metric_name = "Errors"
  namespace   = "AWS/Lambda"
  statistic   = "Sum"
  period      = 300

  dimensions = {
    FunctionName = each.value
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  tags          = var.tags
}

resource "aws_cloudwatch_metric_alarm" "tts_throttles" {
  alarm_name          = "pilcrow-${var.env}-tts-throttled"
  alarm_description   = "The TTS function is hitting its reserved concurrency — real users are being turned away."
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  threshold           = 0
  treat_missing_data  = "notBreaching"

  metric_name = "Throttles"
  namespace   = "AWS/Lambda"
  statistic   = "Sum"
  period      = 300

  dimensions = {
    FunctionName = var.tts_function_name
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  tags          = var.tags
}

/**
 * A hard dollar ceiling on the whole AWS account. This does not stop spending —
 * AWS budgets only notify — but it is the difference between finding out on the
 * day and finding out on the invoice.
 */
resource "aws_budgets_budget" "monthly" {
  name         = "pilcrow-${var.env}-monthly"
  budget_type  = "COST"
  limit_amount = var.monthly_budget_usd
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = var.alert_emails
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "FORECASTED"
    subscriber_email_addresses = var.alert_emails
  }
}

resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = "pilcrow-${var.env}"

  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "metric"
        width  = 12
        height = 6
        properties = {
          title  = "Cost of goods sold (estimated USD)"
          region = var.region
          view   = "timeSeries"
          stat   = "Sum"
          period = 3600
          metrics = [
            ["Pilcrow", "EstimatedCostUsd", "service", "pilcrow", "plan", "free"],
            ["Pilcrow", "EstimatedCostUsd", "service", "pilcrow", "plan", "pro"],
          ]
        }
      },
      {
        type   = "metric"
        width  = 12
        height = 6
        properties = {
          title  = "Paywall hits"
          region = var.region
          view   = "timeSeries"
          stat   = "Sum"
          period = 3600
          metrics = [
            ["Pilcrow", "PaywallHit", "service", "pilcrow", "reason", "free_reads"],
            ["Pilcrow", "PaywallHit", "service", "pilcrow", "reason", "free_chars"],
          ]
        }
      },
    ]
  })
}
