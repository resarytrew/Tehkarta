variable "folder_id" {
  description = "Yandex Cloud folder ID."
  type        = string
}

variable "content_bucket_name" {
  description = "Globally unique private bucket for source documents, curriculum and UMK content."
  type        = string
}

variable "artifacts_bucket_name" {
  description = "Globally unique private bucket for generated exports and other user artifacts."
  type        = string
}

variable "labels" {
  description = "Common tags/labels."
  type        = map(string)
  default     = {}
}
