# Yandex Cloud infrastructure

Terraform is the source of truth for Tehkarta cloud infrastructure. Credentials, database passwords and secret payloads are never committed to Git.

> This repository contains infrastructure-as-code only. No Yandex Cloud resources have been provisioned from this repository session because cloud credentials are intentionally unavailable to the development agent.

## Development topology

`environments/dev` composes the following layers:

- zone-aware VPC/subnets and a private PostgreSQL security group;
- private, versioned Object Storage buckets for RP/UMK source content and generated artifacts;
- Managed PostgreSQL with transaction pooling and a generated application password managed through Connection Manager/Lockbox;
- one Container Registry with separate bounded repositories for API and worker images;
- optional private HTTP Serverless Container for the API;
- API Gateway as the public API edge with a dedicated invoker identity;
- optional task-mode Serverless Container for the AI worker;
- a one-shot timer trigger that invokes the worker on a schedule while PostgreSQL remains the durable queue/source of work;
- optional public-read static web bucket + Cloud CDN + Certificate Manager certificate;
- a dedicated `tehkarta-deploy` identity with no static key and a configurable minimal role set.

Runtime identities are separate by responsibility:

- `tehkarta-dev-api-runtime` — pulls the API image, reads explicitly referenced Lockbox secrets and, when enabled, accesses the private content/artifact buckets;
- `tehkarta-dev-gateway-runtime` — only invokes the private API container;
- `tehkarta-dev-worker-runtime` — pulls the worker image and reads only explicitly referenced Lockbox secrets;
- `tehkarta-dev-worker-trigger` — only invokes the private worker container;
- `tehkarta-dev-deploy` — deployment identity. The default Terraform role set permits image push only; expand deliberately for protected deployment automation.

The API and worker accept split database settings (`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`) so the password alone can be injected from Lockbox. In the Yandex VPC baseline both runtimes use port `6432` and `DB_SSL=require`.

## Worker execution model

The application already has a durable PostgreSQL async-job queue and lease/retry semantics. The development cloud baseline therefore uses a deliberately small execution adapter:

1. Yandex timer invokes a task-mode Serverless Container (default: once per minute).
2. `WORKER_MODE=once` is forced by Terraform.
3. The worker performs readiness, claims at most one durable proposal job and exits.
4. Stale/failed/retry state remains owned by the application/database layers, not by the timer.

This avoids a second queue model during early development. If throughput later requires Message Queue/Event Router, the trigger can change without changing teacher-authoritative lesson state or the durable job contract.

## Static web hosting

When `enable_web_runtime=true`, Terraform creates a dedicated static website bucket and Cloud CDN resource. Only this built frontend bucket is anonymously readable. RP/UMK and generated-artifact buckets remain private.

The module uses the Object Storage website endpoint as the CDN origin, redirects HTTP to HTTPS, and uses the supplied Certificate Manager certificate. Terraform outputs `web_provider_cname`; DNS must point `web_domain` to that value. DNS zone ownership/records are intentionally not guessed or created automatically.

## Lockbox contract

Terraform never stores secret payload values in repository variables. Runtime inputs use references only:

```hcl
api_secret_environment = {
  DB_PASSWORD = {
    id         = "<secret-id>"
    version_id = "<version-id>"
    key        = "password"
  }
}
```

Required API runtime secrets:

- `DB_PASSWORD` — normally the Connection Manager-generated database password;
- `AUTH_IP_HASH_KEY` — separately generated value of at least 32 characters.

Worker secrets always include `DB_PASSWORD` plus the key for each explicitly routed provider (`YANDEX_AI_API_KEY` and/or `OPENROUTER_API_KEY`). There is no silent AI-provider fallback.

When creating custom secret versions through Terraform in a future operator-owned stack, prefer `yandex_lockbox_secret_version_hashed` so plaintext payloads are not retained in Terraform state. Runtime access is granted per secret with `lockbox.payloadViewer`.

## Bootstrap and deployment order

The development root intentionally defaults all public/runtime switches to `false` so the core can be created before images, certificates and secrets exist.

1. Copy `environments/dev/terraform.tfvars.example` to an ignored local `terraform.tfvars`.
2. Set only non-secret `cloud_id`, `folder_id` and optional project settings.
3. Initialize Terraform with remote-state backend configuration, or use `-backend=false` only for validation/bootstrap experiments.
4. Apply the core with `enable_api_runtime=false`, `enable_worker_runtime=false`, `enable_web_runtime=false`.
5. Publish API and worker images using immutable Git SHA tags. Record image digests.
6. Populate/identify Lockbox secrets and configure only their ID/version/key references in local/protected deployment inputs.
7. Configure explicit AI provider/model routes.
8. Enable worker and API runtimes and apply.
9. Run database migrations from a network-capable trusted execution environment before cutting over application revisions. A public GitHub runner must not be given public PostgreSQL access merely to run migrations.
10. Build `apps/web`, upload the `dist/` objects, configure the validated web certificate/domain, enable the web runtime and point DNS at `web_provider_cname`.

## GitHub Actions authentication

The deployment identity is designed for Yandex IAM Workload Identity Federation, not long-lived authorized/static keys. Yandex Cloud currently supports exchanging a GitHub Actions OIDC token for a service-account IAM token. Configure the federation externally because its subject/audience are organization/repository policy decisions.

Recommended GitHub federation properties for this repository:

- issuer: `https://token.actions.githubusercontent.com`;
- JWKS: `https://token.actions.githubusercontent.com/.well-known/jwks`;
- audience: a repository-owner scoped value selected during federation setup;
- federated credential subject: restrict to the protected `dev` GitHub environment or `main` branch rather than every repository job.

The official Yandex example exchanges the GitHub OIDC JWT at `https://auth.yandex.cloud/oauth/token` and uses the service account ID as the token-exchange audience. See: `https://yandex.cloud/en/docs/iam/tutorials/wlif-github-integration`.

## Remote state

`environments/dev/backend.hcl.example` contains the Object Storage S3 backend shape. Backend credentials/state bootstrap are operator-owned and are never committed. Do not run concurrent applies against local state. State locking must be deliberately configured according to the current Terraform/Yandex-supported mechanism before automated concurrent applies are enabled.

## Validation

Cloud credentials are not needed for repository validation:

```text
terraform fmt -check -diff -recursive infra/terraform
cd infra/terraform/environments/dev
terraform init -backend=false -input=false
terraform validate -no-color
```

The pull-request CI also builds API and worker production images and verifies both run as non-root users.

## Deliberately deferred cloud operations

The code does **not** automatically create or guess:

- real Lockbox payload values;
- Certificate Manager domain validation;
- DNS zones/records;
- Workload Identity Federation/federated credentials;
- remote-state credentials/locking;
- a public database endpoint.

Those are external security/ownership decisions and are completed only with the actual Yandex Cloud account and domain context.
