# Yandex Cloud infrastructure

Terraform is the source of truth for Tehkarta cloud infrastructure. Credentials, database passwords and secret payloads are never committed to Git.

## Implemented foundation

The development root is `environments/dev` and currently composes:

- VPC with zone-aware subnets and a private PostgreSQL security group;
- private, versioned Object Storage buckets for curriculum/UMK source content and generated artifacts;
- Managed PostgreSQL with transaction pooling and a generated password managed through Yandex Connection Manager/Lockbox;
- Container Registry and a bounded API image lifecycle policy;
- optional private Serverless Container runtime;
- dedicated runtime and API Gateway service accounts;
- Lockbox secret injection with `lockbox.payloadViewer` granted per secret;
- `storage.uploader` runtime access (includes read access);
- private-container invocation from API Gateway through a least-privilege service account;
- optional custom API Gateway domain with Certificate Manager certificate.

The API runtime accepts split database settings (`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`) so only the password needs to be injected from Lockbox.

## Two-phase bootstrap

The first development apply intentionally sets `enable_api_runtime = false`. This creates the network, storage, PostgreSQL and Container Registry without requiring a container image to already exist.

1. Copy `environments/dev/terraform.tfvars.example` to a local ignored `terraform.tfvars` and set `cloud_id`/`folder_id`.
2. Initialize Terraform with `-backend=false` for a local bootstrap, or provide `backend.hcl` for Object Storage remote state.
3. Apply with `enable_api_runtime = false`.
4. Push the API image to the `api_repository_path` output.
5. Locate the Connection Manager-created Lockbox secret/version and configure `api_secret_environment.DB_PASSWORD`.
6. Set `enable_api_runtime = true`, preferably set `api_image_digest`, and apply again.
7. Use the `api_gateway_domain` output as the public API origin.

The container itself stays private. API Gateway is the public edge and receives only the `serverless-containers.containerInvoker` permission required to invoke that container.

## Remote state

`environments/dev/backend.hcl.example` contains the Yandex Object Storage S3 backend settings. Backend access credentials are supplied only through environment/CI secrets. State locking is intentionally not faked with an AWS-only DynamoDB dependency; a dedicated locking mechanism will be added with the deployment pipeline before concurrent applies are enabled.

## Next infrastructure slices

Still planned: worker containers and durable queue processing, Terraform state bootstrap/locking, GitHub-to-Yandex deployment identity, Cloud Logging/Monitoring, DNS/TLS automation, frontend Object Storage/CDN hosting, Smart Web Security and production environment hardening.
