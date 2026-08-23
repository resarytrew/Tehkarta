terraform {
  required_version = ">= 1.15.8, < 1.16.0"

  required_providers {
    yandex = {
      source  = "yandex-cloud/yandex"
      version = "~> 0.222.0"
    }
  }

  backend "s3" {}
}
