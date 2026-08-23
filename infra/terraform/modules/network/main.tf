resource "yandex_vpc_network" "this" {
  folder_id = var.folder_id
  name      = var.name
  labels    = var.labels
}

resource "yandex_vpc_subnet" "this" {
  for_each = var.subnets

  folder_id      = var.folder_id
  name           = "${var.name}-${each.key}"
  zone           = each.value.zone
  network_id     = yandex_vpc_network.this.id
  v4_cidr_blocks = [each.value.cidr]
  labels         = var.labels
}

resource "yandex_vpc_security_group" "postgres" {
  folder_id   = var.folder_id
  name        = "${var.name}-postgres"
  description = "Private PostgreSQL ingress for Tehkarta application resources in the VPC."
  network_id  = yandex_vpc_network.this.id
  labels      = var.labels

  ingress {
    description    = "PostgreSQL connection pooler from application VPC"
    protocol       = "TCP"
    port           = 6432
    v4_cidr_blocks = [var.network_cidr]
  }

  egress {
    description    = "Allow managed database egress"
    protocol       = "ANY"
    v4_cidr_blocks = ["0.0.0.0/0"]
  }
}
