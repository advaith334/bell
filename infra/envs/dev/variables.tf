variable "region" {
  type    = string
  default = "us-east-1"
}

variable "hosted_ui_domain_prefix" {
  type        = string
  description = "Globally unique across all of AWS. Suggested: pilcrow-dev-<something>."
}

variable "web_base_url" {
  type    = string
  default = "http://localhost:3000"
}

variable "alert_emails" {
  type = list(string)
}
