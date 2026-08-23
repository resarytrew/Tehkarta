variable "cloud_id" {
  description = "Yandex Cloud cloud ID."
  type        = string
}

variable "folder_id" {
  description = "Yandex Cloud folder ID."
  type        = string
}

variable "project_name" {
  description = "Stable resource name prefix."
  type        = string
  default     = "tehkarta"
}

variable "primary_zone" {
  description = "Default Yandex Cloud availability zone."
  type        = string
  default     = "ru-central1-d"
}

variable "primary_subnet_key" {
  description = "Network module subnet key used for the first PostgreSQL host."
  type        = string
  default     = "d"
}

variable "enable_api_runtime" {
  description = "Create Serverless Container and API Gateway after an API image has been pushed to Container Registry."
  type        = bool
  default     = false
}

variable "api_image_tag" {
  description = "Container Registry tag used by the development API runtime."
  type        = string
  default     = "dev"
}

variable "api_image_digest" {
  description = "Optional immutable image digest. Set after CI publishes the selected image."
  type        = string
  default     = null
}

variable "api_secret_environment" {
  description = "Lockbox values injected into the API container. Map key is the environment variable name, for example DB_PASSWORD."
  type = map(object({
    id         = string
    version_id = string
    key        = string
  }))
  default = {}
}

variable "api_custom_domain" {
  description = "Optional custom API domain and Certificate Manager certificate."
  type = object({
    fqdn           = string
    certificate_id = string
  })
  default = null
}
