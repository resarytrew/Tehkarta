variable "folder_id" {
  description = "Yandex Cloud folder ID."
  type        = string
}

variable "name" {
  description = "Worker resource name prefix."
  type        = string
}

variable "service_account_name" {
  description = "Runtime service account name."
  type        = string
  default     = null
}

variable "network_id" {
  description = "VPC network attached to the worker Serverless Container."
  type        = string
}

variable "image_url" {
  description = "Worker image URL in Yandex Container Registry."
  type        = string
}

variable "image_digest" {
  description = "Optional immutable sha256 image digest. Production deployments should set it."
  type        = string
  default     = null
}

variable "memory_mb" {
  description = "Memory allocated to worker task revisions in MiB."
  type        = number
  default     = 512
}

variable "cores" {
  description = "CPU cores allocated to worker task revisions."
  type        = number
  default     = 1
}

variable "core_fraction" {
  description = "Guaranteed CPU fraction."
  type        = number
  default     = 100
}

variable "execution_timeout" {
  description = "Maximum worker task duration."
  type        = string
  default     = "300s"
}

variable "environment_variables" {
  description = "Non-secret worker environment variables."
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

variable "labels" {
  description = "Common resource labels."
  type        = map(string)
  default     = {}
}
