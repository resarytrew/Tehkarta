output "runtime_service_account_id" {
  value       = yandex_iam_service_account.runtime.id
  description = "Runtime service account ID."
}

output "gateway_service_account_id" {
  value       = yandex_iam_service_account.gateway.id
  description = "API Gateway invocation service account ID."
}

output "container_id" {
  value       = yandex_serverless_container.api.id
  description = "Serverless Container ID."
}

output "container_url" {
  value       = yandex_serverless_container.api.url
  description = "Direct private container invoke URL."
}

output "api_gateway_id" {
  value       = yandex_api_gateway.api.id
  description = "API Gateway ID."
}

output "api_gateway_domain" {
  value       = yandex_api_gateway.api.domain
  description = "Default public API Gateway domain."
}
