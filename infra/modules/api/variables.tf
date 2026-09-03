variable "env" { type = string }
variable "package_path" {
  type        = string
  description = "services/dist/api.zip, produced by `npm run build` in services/."
}

variable "table_name" { type = string }
variable "table_arn" { type = string }
variable "table_index_arns" { type = list(string) }

variable "user_pool_id" { type = string }
variable "user_pool_client_id" { type = string }
variable "issuer" { type = string }

variable "secret_arns" {
  type        = list(string)
  description = "Every secret this function may read."
}
variable "elevenlabs_secret_arn" { type = string }
variable "stripe_secret_arn" { type = string }
variable "stripe_webhook_secret_arn" { type = string }

variable "web_base_url" { type = string }

variable "domain_name" {
  type    = string
  default = ""
}
variable "certificate_arn" {
  type    = string
  default = ""
}

variable "log_retention_days" {
  type    = number
  default = 30
}

variable "throttle_burst" {
  type    = number
  default = 200
}
variable "throttle_rate" {
  type    = number
  default = 100
}

variable "extra_environment" {
  type    = map(string)
  default = {}
}

variable "tags" {
  type    = map(string)
  default = {}
}
