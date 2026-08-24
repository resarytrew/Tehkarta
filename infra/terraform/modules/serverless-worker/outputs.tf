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

output "trigger_id" {
  value       = var.enable_timer ? yandex_function_trigger.worker_timer[0].id : null
  description = "Timer trigger ID when scheduled invocation is enabled."
}

output "trigger_service_account_id" {
  value       = var.enable_timer ? yandex_iam_service_account.trigger[0].id : null
  description = "Least-privilege timer invocation service account ID."
}
