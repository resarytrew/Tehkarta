variable "folder_id" {
  description = "Yandex Cloud folder ID."
  type        = string
}

variable "name" {
  description = "Resource name prefix for the API runtime."
  type        = string
}

variable "network_id" {
  description = "VPC network attached to the Serverless Container and API Gateway."
  type        = string
}

variable "image_url" {
  description = "Container image URL in Yandex Container Registry."
  type        = string
}

variable "image_digest" {
  description = "Optional immutable sha256 image digest. Production deployments should set it."
  type        = string
  default     = null
}

variable "memory_mb" {
  description = "Memory allocated to the API container in MiB."
  type        = number
  default     = 512
}

variable "cores" {
  description = "CPU cores allocated to the API container."
  type        = number
  default     = 1
}

variable "core_fraction" {
  description = "Guaranteed CPU fraction."
  type        = number
  default     = 100
}

variable "execution_timeout" {
  description = "Maximum request execution duration for the API container."
  type        = string
  default     = "60s"
}

variable "environment_variables" {
  description = "Non-secret runtime environment variables."
  type        = map(string)
  default     = {}
}

variable "secret_environment" {
  description = "Lockbox values injected into environment variables. Map key is the environment variable name."
  type = map(object({
    id         = string
    version_id = string
    key        = string
  }))
  default = {}
}

variable "grant_storage_uploader" {
  description = "Grant the runtime service account storage.uploader at folder scope. This role includes read access."
  type        = bool
  default     = true
}

variable "custom_domain" {
  description = "Optional API Gateway custom domain and Certificate Manager certificate."
  type = object({
    fqdn           = string
    certificate_id = string
  })
  default = null
}

variable "labels" {
  description = "Common resource labels."
  type        = map(string)
  default     = {}
}
