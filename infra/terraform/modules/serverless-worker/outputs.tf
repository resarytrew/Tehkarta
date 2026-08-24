output "container_id" {
  value       = yandex_serverless_container.worker.id
  description = "Worker Serverless Container ID."
}

output "container_revision_id" {
  value       = yandex_serverless_container.worker.revision_id
  description = "Latest worker Serverless Container revision ID."
}

output "runtime_service_account_id" {
  value       = yandex_iam_service_account.runtime.id
  description = "Worker runtime service account ID."
}
