variable "env" {
  type = string
}

variable "hosted_ui_domain_prefix" {
  type        = string
  description = "Becomes https://<prefix>.auth.<region>.amazoncognito.com. Must be globally unique."
}

variable "callback_urls" {
  type        = list(string)
  description = "The pilcrow:// deep link, plus a localhost URL for development."
}

variable "logout_urls" {
  type = list(string)
}

variable "google_secret_arn" {
  type        = string
  description = "Secrets Manager secret holding {client_id, client_secret}."
}

variable "apple_secret_arn" {
  type        = string
  description = "Secrets Manager secret holding {services_id, team_id, key_id, private_key}."
}

variable "tags" {
  type    = map(string)
  default = {}
}
