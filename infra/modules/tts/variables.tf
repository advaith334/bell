variable "env" { type = string }
variable "package_path" { type = string }

variable "table_name" { type = string }
variable "table_arn" { type = string }
variable "table_index_arns" { type = list(string) }

variable "user_pool_id" { type = string }
variable "user_pool_client_id" { type = string }

variable "elevenlabs_secret_arn" { type = string }

variable "reserved_concurrency" {
  type        = number
  default     = 50
  description = "Cost blast radius. Raise deliberately, with a budget alarm in place."
}

variable "log_retention_days" {
  type    = number
  default = 30
}

variable "tags" {
  type    = map(string)
  default = {}
}
