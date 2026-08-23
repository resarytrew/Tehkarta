output "network_id" {
  value       = module.network.network_id
  description = "Development VPC ID."
}

output "postgres_host" {
  value       = module.postgres.host_fqdn
  description = "Private PostgreSQL host."
}

output "postgres_connection_manager" {
  value       = module.postgres.connection_manager
  description = "Sensitive Connection Manager metadata used to locate generated database credentials."
  sensitive   = true
}

output "content_bucket_name" {
  value       = module.storage.content_bucket_name
  description = "Private curriculum and UMK source bucket."
}

output "artifacts_bucket_name" {
  value       = module.storage.artifacts_bucket_name
  description = "Private generated artifact bucket."
}

output "api_repository_path" {
  value       = module.registry.api_repository_path
  description = "Push API images to this Container Registry path."
}

output "api_gateway_domain" {
  value       = var.enable_api_runtime ? module.api[0].api_gateway_domain : null
  description = "Public API Gateway domain when the API runtime is enabled."
}
