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
  browser_origins = distinct(concat(
    var.api_allowed_origins,
    var.enable_web_runtime && var.web_domain != null ? ["https://${var.web_domain}"] : []
  ))
}

check "api_runtime_secrets" {
  assert {
    condition = !var.enable_api_runtime || (
      contains(keys(var.api_secret_environment), "DB_PASSWORD") &&
      contains(keys(var.api_secret_environment), "AUTH_IP_HASH_KEY")
    )
    error_message = "Enabling the API runtime requires DB_PASSWORD and AUTH_IP_HASH_KEY Lockbox references."
  }
}

check "worker_runtime_configuration" {
  assert {
    condition = !var.enable_worker_runtime || (
      var.ai_variants_model != null && trimspace(var.ai_variants_model) != "" &&
      var.ai_reformulate_model != null && trimspace(var.ai_reformulate_model) != "" &&
      contains(keys(var.worker_secret_environment), "DB_PASSWORD") &&
      (var.ai_variants_provider != "yandex" && var.ai_reformulate_provider != "yandex" || contains(keys(var.worker_secret_environment), "YANDEX_AI_API_KEY")) &&
      (var.ai_variants_provider != "openrouter" && var.ai_reformulate_provider != "openrouter" || contains(keys(var.worker_secret_environment), "OPENROUTER_API_KEY"))
    )
    error_message = "Enabling the worker requires explicit models, DB_PASSWORD, and every AI provider credential referenced by routing."
  }
}

check "web_runtime_configuration" {
  assert {
    condition = !var.enable_web_runtime || (
      var.web_bucket_name != null && trimspace(var.web_bucket_name) != "" &&
      var.web_domain != null && trimspace(var.web_domain) != "" &&
      var.web_certificate_id != null && trimspace(var.web_certificate_id) != ""
    )
    error_message = "Enabling the web runtime requires web_bucket_name, web_domain, and web_certificate_id."
  }
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

module "deploy_identity" {
  source = "../../modules/deploy-identity"

  folder_id = var.folder_id
  name      = "${local.name_prefix}-deploy"
  roles     = var.deploy_roles
}

module "api" {
  count  = var.enable_api_runtime ? 1 : 0
  source = "../../modules/serverless-api"

  folder_id                    = var.folder_id
  name                         = local.name_prefix
  runtime_service_account_name = "${local.name_prefix}-api-runtime"
  gateway_service_account_name = "${local.name_prefix}-gateway-runtime"
  network_id                   = module.network.network_id
  image_url                    = "${module.registry.api_repository_path}:${var.api_image_tag}"
  image_digest                 = var.api_image_digest
  labels                       = local.labels

  environment_variables = {
    DB_HOST               = module.postgres.host_fqdn
    DB_PORT               = "6432"
    DB_NAME               = module.postgres.database_name
    DB_USER               = module.postgres.database_user
    DB_SSL                = "require"
    DB_APPLICATION_NAME   = "tehkarta-api"
    CORS_ALLOWED_ORIGINS  = join(",", local.browser_origins)
    CONTENT_BUCKET_NAME   = module.storage.content_bucket_name
    ARTIFACTS_BUCKET_NAME = module.storage.artifacts_bucket_name
    YC_FOLDER_ID          = var.folder_id
  }

  secret_environment = var.api_secret_environment
  custom_domain      = var.api_custom_domain
}

module "worker" {
  count  = var.enable_worker_runtime ? 1 : 0
  source = "../../modules/serverless-worker"

  folder_id                    = var.folder_id
  name                         = "${local.name_prefix}-worker"
  service_account_name         = "${local.name_prefix}-worker-runtime"
  trigger_service_account_name = "${local.name_prefix}-worker-trigger"
  network_id                   = module.network.network_id
  image_url                    = "${module.registry.worker_repository_path}:${var.worker_image_tag}"
  image_digest                 = var.worker_image_digest
  timer_cron_expression        = var.worker_timer_cron_expression
  labels                       = local.labels

  environment_variables = {
    DB_HOST                   = module.postgres.host_fqdn
    DB_PORT                   = "6432"
    DB_NAME                   = module.postgres.database_name
    DB_USER                   = module.postgres.database_user
    DB_SSL                    = "require"
    DB_APPLICATION_NAME       = "tehkarta-worker"
    AI_VARIANTS_PROVIDER      = var.ai_variants_provider
    AI_VARIANTS_MODEL         = coalesce(var.ai_variants_model, "not-configured")
    AI_REFORMULATE_PROVIDER   = var.ai_reformulate_provider
    AI_REFORMULATE_MODEL      = coalesce(var.ai_reformulate_model, "not-configured")
    AI_ROUTING_POLICY_VERSION = var.ai_routing_policy_version
    AI_TIMEOUT_MS             = "90000"
    AI_MAX_TOKENS             = "2000"
    YC_FOLDER_ID              = var.folder_id
  }

  secret_environment = var.worker_secret_environment
}

module "web" {
  count  = var.enable_web_runtime ? 1 : 0
  source = "../../modules/web-cdn"

  folder_id      = var.folder_id
  name           = local.name_prefix
  bucket_name    = coalesce(var.web_bucket_name, "disabled")
  domain         = coalesce(var.web_domain, "disabled.invalid")
  certificate_id = coalesce(var.web_certificate_id, "disabled")
  labels         = local.labels
}
