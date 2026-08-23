resource "yandex_mdb_postgresql_cluster" "this" {
  folder_id           = var.folder_id
  name                = var.name
  environment         = var.environment
  network_id          = var.network_id
  security_group_ids  = [var.security_group_id]
  deletion_protection = var.deletion_protection
  labels              = var.labels

  config {
    version = var.postgres_version

    resources {
      resource_preset_id = var.resource_preset_id
      disk_type_id       = var.disk_type_id
      disk_size          = var.disk_size_gb
    }

    pooler_config {
      pooling_mode = "TRANSACTION"
      pool_discard = true
    }
  }

  host {
    zone             = var.zone
    name             = "${var.name}-a"
    subnet_id        = var.subnet_id
    assign_public_ip = false
  }

  maintenance_window {
    type = "ANYTIME"
  }
}

resource "yandex_mdb_postgresql_user" "app" {
  cluster_id = yandex_mdb_postgresql_cluster.this.id
  name       = var.database_user

  generate_password        = true
  user_password_encryption = "USER_PASSWORD_ENCRYPTION_SCRAM_SHA_256"
  login                    = true
  conn_limit               = 100
  deletion_protection      = var.deletion_protection ? "true" : "false"

  user_connection_manager {
    connection_folder_id = var.folder_id
    secret_folder_id     = var.folder_id
  }

  settings = {
    default_transaction_isolation       = "read committed"
    statement_timeout                   = 30000
    idle_in_transaction_session_timeout = 30000
  }
}

resource "yandex_mdb_postgresql_database" "app" {
  cluster_id          = yandex_mdb_postgresql_cluster.this.id
  name                = var.database_name
  owner               = yandex_mdb_postgresql_user.app.name
  deletion_protection = var.deletion_protection ? "true" : "false"

  depends_on = [yandex_mdb_postgresql_user.app]
}
