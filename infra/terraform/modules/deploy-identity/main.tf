resource "yandex_iam_service_account" "deploy" {
  folder_id   = var.folder_id
  name        = var.name
  description = "Tehkarta CI/CD deploy identity. No static key is created by Terraform."
}

resource "yandex_resourcemanager_folder_iam_member" "roles" {
  for_each = var.roles

  folder_id = var.folder_id
  role      = each.value
  member    = "serviceAccount:${yandex_iam_service_account.deploy.id}"
}
