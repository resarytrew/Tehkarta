output "cluster_id" {
  value       = yandex_mdb_postgresql_cluster.this.id
  description = "Managed PostgreSQL cluster ID."
}

output "database_name" {
  value       = yandex_mdb_postgresql_database.app.name
  description = "Application database name."
}

output "database_user" {
  value       = yandex_mdb_postgresql_user.app.name
  description = "Application database username."
}

output "host_fqdn" {
  value       = yandex_mdb_postgresql_cluster.this.host[0].fqdn
  description = "Private PostgreSQL host FQDN. Connect through port 6432."
}

output "connection_manager" {
  value       = yandex_mdb_postgresql_user.app.connection_manager
  description = "Non-secret Connection Manager metadata for the generated database credentials."
  sensitive   = true
}
