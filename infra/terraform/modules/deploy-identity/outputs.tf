output "service_account_id" {
  value       = yandex_iam_service_account.deploy.id
  description = "Deploy service account ID for workload identity / impersonation setup."
}
