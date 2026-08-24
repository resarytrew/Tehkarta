variable "folder_id" {
  description = "Yandex Cloud folder ID."
  type        = string
}

variable "name" {
  description = "Resource name prefix for static web hosting."
  type        = string
}

variable "bucket_name" {
  description = "Globally unique Object Storage bucket name for the built web application."
  type        = string
}

variable "domain" {
  description = "Public application hostname served by Cloud CDN, for example app.example.ru."
  type        = string
}

variable "certificate_id" {
  description = "Certificate Manager certificate ID valid for domain."
  type        = string
}

variable "labels" {
  description = "Common resource labels."
  type        = map(string)
  default     = {}
}
