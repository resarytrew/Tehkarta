locals {
  runtime_service_account_name = coalesce(var.runtime_service_account_name, "${var.name}-api-runtime")
  gateway_service_account_name = coalesce(var.gateway_service_account_name, "${var.name}-gateway-runtime")
  runtime_member               = "serviceAccount:${yandex_iam_service_account.runtime.id}"
  gateway_member               = "serviceAccount:${yandex_iam_service_account.gateway.id}"
}

resource "yandex_iam_service_account" "runtime" {
  folder_id   = var.folder_id
  name        = local.runtime_service_account_name
  description = "Runtime identity for the Tehkarta API Serverless Container."
}

resource "yandex_iam_service_account" "gateway" {
  folder_id   = var.folder_id
  name        = local.gateway_service_account_name
  description = "Least-privilege identity used by API Gateway to invoke the private Tehkarta API container."
}

resource "yandex_resourcemanager_folder_iam_member" "runtime_image_puller" {
  folder_id = var.folder_id
  role      = "container-registry.images.puller"
  member    = local.runtime_member
}

resource "yandex_resourcemanager_folder_iam_member" "runtime_storage" {
  count = var.grant_storage_uploader ? 1 : 0

  folder_id = var.folder_id
  role      = "storage.uploader"
  member    = local.runtime_member
}

resource "yandex_lockbox_secret_iam_member" "runtime" {
  for_each = var.secret_environment

  secret_id = each.value.id
  role      = "lockbox.payloadViewer"
  member    = local.runtime_member
}

resource "yandex_serverless_container" "api" {
  folder_id          = var.folder_id
  name               = "${var.name}-api"
  description        = "Private HTTP API for Tehkarta. Invoked through API Gateway only."
  memory             = var.memory_mb
  cores              = var.cores
  core_fraction      = var.core_fraction
  execution_timeout  = var.execution_timeout
  service_account_id = yandex_iam_service_account.runtime.id
  labels             = var.labels

  runtime {
    type = "http"
  }

  connectivity {
    network_id = var.network_id
  }

  image {
    url    = var.image_url
    digest = var.image_digest
    environment = merge({
      NODE_ENV = "production"
      HOST     = "0.0.0.0"
      PORT     = "8080"
    }, var.environment_variables)
  }

  dynamic "secrets" {
    for_each = var.secret_environment

    content {
      id                   = secrets.value.id
      version_id           = secrets.value.version_id
      key                  = secrets.value.key
      environment_variable = secrets.key
    }
  }

  depends_on = [
    yandex_resourcemanager_folder_iam_member.runtime_image_puller,
    yandex_resourcemanager_folder_iam_member.runtime_storage,
    yandex_lockbox_secret_iam_member.runtime
  ]
}

resource "yandex_serverless_container_iam_member" "gateway_invoker" {
  container_id = yandex_serverless_container.api.id
  role         = "serverless-containers.containerInvoker"
  member       = local.gateway_member
}

resource "yandex_api_gateway" "api" {
  folder_id   = var.folder_id
  name        = "${var.name}-gateway"
  description = "Public HTTPS edge for the private Tehkarta API container."
  labels      = var.labels

  connectivity {
    network_id = var.network_id
  }

  dynamic "custom_domains" {
    for_each = var.custom_domain == null ? [] : [var.custom_domain]

    content {
      fqdn           = custom_domains.value.fqdn
      certificate_id = custom_domains.value.certificate_id
    }
  }

  spec = templatefile("${path.module}/gateway.yaml.tftpl", {
    container_id       = yandex_serverless_container.api.id
    service_account_id = yandex_iam_service_account.gateway.id
  })

  depends_on = [yandex_serverless_container_iam_member.gateway_invoker]
}
