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

variable "trigger_service_account_name" {
  description = "Service account used by the timer trigger to invoke the private worker container."
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

variable "enable_timer" {
  description = "Create a timer trigger that invokes one worker task on each tick."
  type        = bool
  default     = true
}

variable "timer_cron_expression" {
  description = "Yandex timer cron expression. The development default invokes the task once per minute."
  type        = string
  default     = "* * ? * * *"
}

variable "timer_payload" {
  description = "Opaque timer payload. Worker processing remains driven by the durable PostgreSQL queue."
  type        = string
  default     = "{\"source\":\"timer\"}"
}

variable "timer_retry_attempts" {
  description = "Number of container invocation retries performed by the trigger."
  type        = number
  default     = 1

  validation {
    condition     = var.timer_retry_attempts >= 1 && var.timer_retry_attempts <= 5
    error_message = "timer_retry_attempts must be between 1 and 5."
  }
}

variable "timer_retry_interval_seconds" {
  description = "Seconds between trigger invocation retries."
  type        = number
  default     = 20

  validation {
    condition     = var.timer_retry_interval_seconds >= 10 && var.timer_retry_interval_seconds <= 60
    error_message = "timer_retry_interval_seconds must be between 10 and 60."
  }
}

variable "labels" {
  description = "Common resource labels."
  type        = map(string)
  default     = {}
}
