variable "folder_id" {
  description = "Yandex Cloud folder ID."
  type        = string
}

variable "name" {
  description = "Deploy service account name."
  type        = string
}

variable "roles" {
  description = "Folder roles granted to the deploy identity. Keep this list minimal; do not use editor by default."
  type        = set(string)
  default     = ["container-registry.images.pusher"]
}
