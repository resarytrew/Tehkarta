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

output "worker_repository_path" {
  value       = module.registry.worker_repository_path
  description = "Push worker images to this Container Registry path."
}

output "deploy_service_account_id" {
  value       = module.deploy_identity.service_account_id
  description = "tehkarta-deploy service account ID. Configure workload identity federation outside of long-lived static keys."
}

output "api_gateway_domain" {
  value       = var.enable_api_runtime ? module.api[0].api_gateway_domain : null
  description = "Public API Gateway domain when the API runtime is enabled."
}

output "api_runtime_service_account_id" {
  value       = var.enable_api_runtime ? module.api[0].runtime_service_account_id : null
  description = "API runtime service account ID."
}

output "worker_container_id" {
  value       = var.enable_worker_runtime ? module.worker[0].container_id : null
  description = "Task-mode worker Serverless Container ID."
}

output "worker_timer_trigger_id" {
  value       = var.enable_worker_runtime ? module.worker[0].trigger_id : null
  description = "Development timer trigger that invokes one worker task per schedule tick."
}

output "worker_runtime_service_account_id" {
  value       = var.enable_worker_runtime ? module.worker[0].runtime_service_account_id : null
  description = "Worker runtime service account ID."
}

output "web_bucket_name" {
  value       = var.enable_web_runtime ? module.web[0].bucket_name : null
  description = "Static web Object Storage bucket when enabled."
}

output "web_domain" {
  value       = var.enable_web_runtime ? module.web[0].domain : null
  description = "Public Cloud CDN application hostname."
}

output "web_provider_cname" {
  value       = var.enable_web_runtime ? module.web[0].provider_cname : null
  description = "CDN provider CNAME that must be configured in DNS."
}
