variable "folder_id" {
  description = "Yandex Cloud folder ID."
  type        = string
}

variable "name" {
  description = "Container Registry name."
  type        = string
}

variable "api_repository_name" {
  description = "Repository name used for the Tehkarta API image."
  type        = string
  default     = "api"
}

variable "worker_repository_name" {
  description = "Repository name used for the Tehkarta worker image."
  type        = string
  default     = "worker"
}

variable "retained_tagged_images" {
  description = "Maximum number of tagged API/worker images retained by lifecycle policy."
  type        = number
  default     = 30
}

variable "labels" {
  description = "Common resource labels."
  type        = map(string)
  default     = {}
}
