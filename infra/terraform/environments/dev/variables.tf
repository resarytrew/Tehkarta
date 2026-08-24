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

variable "api_allowed_origins" {
  description = "Additional browser origins allowed to call the credentialed API. The CDN web domain is added automatically when enabled."
  type        = list(string)
  default     = ["http://localhost:5173"]
}

variable "enable_api_runtime" {
  description = "Create Serverless Container and API Gateway after an API image has been pushed to Container Registry."
  type        = bool
  default     = false
}

variable "api_image_tag" {
  description = "Container Registry tag used by the development API runtime. Prefer immutable Git SHA tags."
  type        = string
  default     = "dev"
}

variable "api_image_digest" {
  description = "Optional immutable image digest. Set after CI publishes the selected image."
  type        = string
  default     = null
}

variable "api_secret_environment" {
  description = "Lockbox values injected into the API container. Required production keys include DB_PASSWORD and AUTH_IP_HASH_KEY."
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

variable "enable_worker_runtime" {
  description = "Create the task-mode AI worker after a worker image and Lockbox references have been configured."
  type        = bool
  default     = false
}

variable "worker_image_tag" {
  description = "Container Registry tag used by the development worker runtime. Prefer immutable Git SHA tags."
  type        = string
  default     = "dev"
}

variable "worker_image_digest" {
  description = "Optional immutable worker image digest."
  type        = string
  default     = null
}

variable "worker_secret_environment" {
  description = "Lockbox values injected into the worker. Include DB_PASSWORD and credentials for every explicitly routed AI provider."
  type = map(object({
    id         = string
    version_id = string
    key        = string
  }))
  default = {}
}

variable "worker_timer_cron_expression" {
  description = "Development schedule for the task worker. One invocation claims at most one durable PostgreSQL proposal job."
  type        = string
  default     = "* * ? * * *"
}

variable "ai_variants_provider" {
  description = "Explicit provider for candidate-variant generation."
  type        = string
  default     = "yandex"

  validation {
    condition     = contains(["yandex", "openrouter"], var.ai_variants_provider)
    error_message = "ai_variants_provider must be yandex or openrouter."
  }
}

variable "ai_variants_model" {
  description = "Explicit provider model identifier for candidate variants. Must be set before enabling the worker."
  type        = string
  default     = null
}

variable "ai_reformulate_provider" {
  description = "Explicit provider for improve/reformulate generation."
  type        = string
  default     = "yandex"

  validation {
    condition     = contains(["yandex", "openrouter"], var.ai_reformulate_provider)
    error_message = "ai_reformulate_provider must be yandex or openrouter."
  }
}

variable "ai_reformulate_model" {
  description = "Explicit provider model identifier for improve/reformulate. Must be set before enabling the worker."
  type        = string
  default     = null
}

variable "ai_routing_policy_version" {
  description = "Versioned routing policy persisted with AI invocation provenance."
  type        = string
  default     = "routing-v2"
}

variable "enable_web_runtime" {
  description = "Create public-read static web Object Storage plus Cloud CDN."
  type        = bool
  default     = false
}

variable "web_bucket_name" {
  description = "Globally unique Object Storage bucket name for the built React application. Required when web runtime is enabled."
  type        = string
  default     = null
}

variable "web_domain" {
  description = "Application hostname for Cloud CDN. Required when web runtime is enabled."
  type        = string
  default     = null
}

variable "web_certificate_id" {
  description = "Validated Certificate Manager certificate for web_domain. Required when web runtime is enabled."
  type        = string
  default     = null
}

variable "deploy_roles" {
  description = "Folder roles granted to tehkarta-deploy. Keep minimal; the default permits image push only."
  type        = set(string)
  default     = ["container-registry.images.pusher"]
}
