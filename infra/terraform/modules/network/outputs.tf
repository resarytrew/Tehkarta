output "network_id" {
  value       = yandex_vpc_network.this.id
  description = "Application VPC ID."
}

output "subnet_ids" {
  value       = { for key, subnet in yandex_vpc_subnet.this : key => subnet.id }
  description = "Subnet IDs keyed by short zone key."
}

output "subnet_zones" {
  value       = { for key, subnet in yandex_vpc_subnet.this : key => subnet.zone }
  description = "Subnet availability zones keyed by short zone key."
}

output "postgres_security_group_id" {
  value       = yandex_vpc_security_group.postgres.id
  description = "Security group attached to Managed PostgreSQL."
}
