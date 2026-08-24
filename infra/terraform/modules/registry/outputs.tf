output "registry_id" {
  value       = yandex_container_registry.this.id
  description = "Container Registry ID."
}

output "api_repository_id" {
  value       = yandex_container_repository.api.id
  description = "API repository ID."
}

output "api_repository_path" {
  value       = "cr.yandex/${yandex_container_registry.this.id}/${var.api_repository_name}"
  description = "Registry path used when tagging and deploying the API image."
}

output "worker_repository_id" {
  value       = yandex_container_repository.worker.id
  description = "Worker repository ID."
}

output "worker_repository_path" {
  value       = "cr.yandex/${yandex_container_registry.this.id}/${var.worker_repository_name}"
  description = "Registry path used when tagging and deploying the worker image."
}
