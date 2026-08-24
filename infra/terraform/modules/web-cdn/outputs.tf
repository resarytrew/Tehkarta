output "bucket_name" {
  value       = yandex_storage_bucket.web.bucket
  description = "Object Storage bucket that receives the built web application."
}

output "website_endpoint" {
  value       = yandex_storage_bucket.web.website_endpoint
  description = "Object Storage website endpoint used as the CDN origin."
}

output "domain" {
  value       = var.domain
  description = "Public CDN hostname."
}

output "provider_cname" {
  value       = yandex_cdn_resource.web.provider_cname
  description = "CDN provider CNAME that DNS must point to."
}

output "cdn_resource_id" {
  value       = yandex_cdn_resource.web.id
  description = "Cloud CDN resource ID."
}
