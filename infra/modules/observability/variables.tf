variable "env" { type = string }
variable "region" { type = string }

variable "alert_emails" {
  type        = list(string)
  description = "Each address must confirm the SNS subscription by email before it receives anything."
}

variable "function_names" { type = list(string) }
variable "tts_function_name" { type = string }

variable "hourly_char_threshold" {
  type        = number
  default     = 2000000
  description = "Characters/hour before alarming. 2M ≈ $100/hour of ElevenLabs. Tighten once real usage is known."
}

variable "monthly_budget_usd" {
  type    = string
  default = "200"
}

variable "tags" {
  type    = map(string)
  default = {}
}
