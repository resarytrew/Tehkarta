resource "yandex_container_registry" "this" {
  folder_id = var.folder_id
  name      = var.name
  labels    = var.labels
}

resource "yandex_container_repository" "api" {
  name = "${yandex_container_registry.this.id}/${var.api_repository_name}"
}

resource "yandex_container_repository_lifecycle_policy" "api" {
  name          = "keep-recent-api-images"
  repository_id = yandex_container_repository.api.id
  status        = "active"

  rule {
    description   = "Keep recent production candidates and remove old untagged layers."
    untagged      = true
    expire_period = "168h"
  }

  rule {
    description  = "Keep the registry bounded while preserving recent deployable images."
    retained_top = var.retained_tagged_images
    tag_regexp   = ".+"
  }
}
