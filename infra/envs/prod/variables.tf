variable "region" {
  type    = string
  default = "us-east-1"
}

variable "zone_name" {
  type        = string
  description = "The registered domain, e.g. pilcrow.app. The Route 53 zone must already exist."
}

variable "hosted_ui_domain_prefix" {
  type        = string
  description = "Globally unique across AWS. Changing it invalidates every session, so pick once."
}

variable "releases_bucket_name" {
  type = string
}

variable "alert_emails" {
  type = list(string)
}

variable "tts_reserved_concurrency" {
  type        = number
  default     = 50
  description = "Roughly the ceiling on simultaneous synthesis, and therefore on how fast money can leave."
}

variable "hourly_char_threshold" {
  type    = number
  default = 2000000
}

variable "monthly_budget_usd" {
  type    = string
  default = "200"
}
