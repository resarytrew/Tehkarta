locals {
  runtime_service_account_name = coalesce(var.service_account_name, "${var.name}-worker-runtime")
  runtime_member               = "serviceAccount:${yandex_iam_service_account.runtime.id}"
}

resource "yandex_iam_service_account" "runtime" {
  folder_id   = var.folder_id
  name        = local.runtime_service_account_name
  description = "Runtime identity for the Tehkarta AI proposal worker."
}

resource "yandex_resourcemanager_folder_iam_member" "runtime_image_puller" {
  folder_id = var.folder_id
  role      = "container-registry.images.puller"
  member    = local.runtime_member
}

resource "yandex_lockbox_secret_iam_member" "runtime" {
  for_each = var.secret_environment

  secret_id = each.value.id
  role      = "lockbox.payloadViewer"
  member    = local.runtime_member
}

resource "yandex_serverless_container" "worker" {
  folder_id          = var.folder_id
  name               = var.name
  description        = "Tehkarta asynchronous AI proposal worker"
  memory             = var.memory_mb
  cores              = var.cores
  core_fraction      = var.core_fraction
  execution_timeout  = var.execution_timeout
  service_account_id = yandex_iam_service_account.runtime.id
  labels             = var.labels

  runtime {
    type = "task"
  }

  connectivity {
    network_id = var.network_id
  }

  image {
    url         = var.image_url
    digest      = var.image_digest
    environment = merge(var.environment_variables, { WORKER_MODE = "once" })
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
    yandex_lockbox_secret_iam_member.runtime
  ]
}
