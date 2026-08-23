output "content_bucket_name" {
  value       = yandex_storage_bucket.content.bucket
  description = "Private source content bucket name."
}

output "artifacts_bucket_name" {
  value       = yandex_storage_bucket.artifacts.bucket
  description = "Private generated artifacts bucket name."
}
