resource "yandex_storage_bucket" "content" {
  folder_id = var.folder_id
  bucket    = var.content_bucket_name
  acl       = "private"
  tags      = var.labels

  anonymous_access_flags {
    read        = false
    list        = false
    config_read = false
  }

  versioning {
    enabled = true
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "yandex_storage_bucket" "artifacts" {
  folder_id = var.folder_id
  bucket    = var.artifacts_bucket_name
  acl       = "private"
  tags      = var.labels

  anonymous_access_flags {
    read        = false
    list        = false
    config_read = false
  }

  versioning {
    enabled = true
  }

  lifecycle_rule {
    id      = "abort-incomplete-uploads"
    enabled = true

    abort_incomplete_multipart_upload_days = 7
  }
}
