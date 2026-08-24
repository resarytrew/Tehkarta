locals {
  website_origin = "${yandex_storage_bucket.web.bucket}.website.yandexcloud.net"
}

resource "yandex_storage_bucket" "web" {
  folder_id = var.folder_id
  bucket    = var.bucket_name
  acl       = "public-read"

  anonymous_access_flags {
    read        = true
    list        = false
    config_read = false
  }

  website {
    index_document = "index.html"
    error_document = "index.html"
  }

  versioning {
    enabled = true
  }

  lifecycle_rule {
    id      = "cleanup-noncurrent-web-builds"
    enabled = true

    noncurrent_version_expiration {
      days = 30
    }
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "yandex_cdn_origin_group" "web" {
  folder_id = var.folder_id
  name      = "${var.name}-web-origin"
  use_next  = false

  origin {
    source = local.website_origin
  }
}

resource "yandex_cdn_resource" "web" {
  folder_id       = var.folder_id
  cname           = var.domain
  active          = true
  origin_protocol = "http"
  origin_group_id = yandex_cdn_origin_group.web.id
  labels          = var.labels

  options {
    allowed_http_methods   = ["GET", "HEAD", "OPTIONS"]
    custom_host_header     = local.website_origin
    ignore_cookie          = true
    redirect_http_to_https = true
  }

  ssl_certificate {
    type                   = "certificate_manager"
    certificate_manager_id = var.certificate_id
  }
}
