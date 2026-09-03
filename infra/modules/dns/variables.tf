variable "zone_name" {
  type        = string
  description = "e.g. pilcrow.app — the zone must already exist and the registrar must delegate to it."
}

variable "api_domain" { type = string }
variable "download_domain" { type = string }

variable "api_target" {
  type = object({
    name    = string
    zone_id = string
  })
  default     = null
  description = "From the api module's domain_target output. Null on the first apply."
}

variable "download_target" {
  type = object({
    name    = string
    zone_id = string
  })
  default = null
}

variable "tags" {
  type    = map(string)
  default = {}
}
