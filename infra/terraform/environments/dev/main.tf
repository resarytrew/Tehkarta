locals {
  environment = "dev"
  name_prefix = "${var.project_name}-${local.environment}"

  labels = {
    project     = var.project_name
    environment = local.environment
    managed_by  = "terraform"
  }

  content_bucket_name   = lower("${local.name_prefix}-content-${var.folder_id}")
  artifacts_bucket_name = lower("${local.name_prefix}-artifacts-${var.folder_id}")
}

module "network" {
  source = "../../modules/network"

  folder_id = var.folder_id
  name      = local.name_prefix
  labels    = local.labels
}

module "storage" {
  source = "../../modules/storage"

  folder_id             = var.folder_id
  content_bucket_name   = local.content_bucket_name
  artifacts_bucket_name = local.artifacts_bucket_name
  labels                = local.labels
}

module "postgres" {
  source = "../../modules/postgres"

  folder_id           = var.folder_id
  name                = "${local.name_prefix}-postgres"
  network_id          = module.network.network_id
  security_group_id   = module.network.postgres_security_group_id
  subnet_id           = module.network.subnet_ids[var.primary_subnet_key]
  zone                = module.network.subnet_zones[var.primary_subnet_key]
  environment         = "PRESTABLE"
  deletion_protection = false
  labels              = local.labels
}

module "registry" {
  source = "../../modules/registry"

  folder_id = var.folder_id
  name      = "${local.name_prefix}-registry"
  labels    = local.labels
}

module "api" {
  count  = var.enable_api_runtime ? 1 : 0
  source = "../../modules/serverless-api"

  folder_id    = var.folder_id
  name         = local.name_prefix
  network_id   = module.network.network_id
  image_url    = "${module.registry.api_repository_path}:${var.api_image_tag}"
  image_digest = var.api_image_digest
  labels       = local.labels

  environment_variables = {
    DB_HOST               = module.postgres.host_fqdn
    DB_PORT               = "6432"
    DB_NAME               = module.postgres.database_name
    DB_USER               = module.postgres.database_user
    DB_SSL                = "require"
    CONTENT_BUCKET_NAME   = module.storage.content_bucket_name
    ARTIFACTS_BUCKET_NAME = module.storage.artifacts_bucket_name
    YC_FOLDER_ID          = var.folder_id
  }

  secret_environment = var.api_secret_environment
  custom_domain      = var.api_custom_domain
}
