variable "name" {
  description = "Resource name prefix."
  type        = string
}

variable "folder_id" {
  description = "Yandex Cloud folder ID."
  type        = string
}

variable "network_cidr" {
  description = "CIDR allowed to reach private PostgreSQL from resources attached to the application VPC."
  type        = string
  default     = "10.42.0.0/16"
}

variable "subnets" {
  description = "Availability-zone subnet definitions. Keep one subnet per zone so serverless/API Gateway connectivity can grow without replacing the VPC."
  type = map(object({
    zone = string
    cidr = string
  }))

  default = {
    a = {
      zone = "ru-central1-a"
      cidr = "10.42.1.0/24"
    }
    b = {
      zone = "ru-central1-b"
      cidr = "10.42.2.0/24"
    }
    d = {
      zone = "ru-central1-d"
      cidr = "10.42.3.0/24"
    }
  }
}

variable "labels" {
  description = "Common resource labels."
  type        = map(string)
  default     = {}
}
