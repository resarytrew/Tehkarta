# Yandex Cloud dev deployment runbook

This runbook describes the safe deployment sequence for Tehkarta's development environment. It deliberately separates image publication, schema migration and runtime cutover.

## Preconditions

- Core Terraform resources have been applied by an authorized operator: VPC, private PostgreSQL, private RP/UMK/artifact buckets, Container Registry and `tehkarta-dev-deploy` service account.
- GitHub protected environment `dev` exists.
- Yandex IAM Workload Identity Federation links only the intended GitHub subject to `tehkarta-dev-deploy`.
- GitHub environment variables contain only non-secret identifiers:
  - `YC_DEPLOY_SERVICE_ACCOUNT_ID`;
  - `YC_REGISTRY_ID`.
- Runtime secret payloads are already in Lockbox. Git stores only secret ID/version/key references.
- API/worker AI routes are explicit; there is no implicit provider fallback.

## 1. Publish immutable images

Run GitHub Actions workflow **Publish dev images** from the commit that will be deployed.

The workflow:

1. obtains a GitHub OIDC token;
2. exchanges it for a short-lived Yandex IAM token under the federated deploy service account;
3. builds API and worker production images;
4. verifies both images run as `USER node`;
5. pushes tags exactly equal to `GITHUB_SHA`.

Do not publish `latest` as a deployment source of truth.

## 2. Record immutable digests

Resolve the registry digests for the published SHA tags and set the protected/operator Terraform inputs:

```text
api_image_tag       = <git-sha>
api_image_digest    = sha256:<digest>
worker_image_tag    = <git-sha>
worker_image_digest = sha256:<digest>
```

A digest is preferred over a mutable tag for the actual Serverless Container revision.

## 3. Run migrations before cutover

Managed PostgreSQL has no public IP. Do **not** weaken the network policy so a public GitHub-hosted runner can reach it.

Run:

```text
pnpm db:migrate
```

from an approved execution environment with VPC connectivity and `DB_*`/Lockbox access. Examples are an operator-controlled host/private runner or a future dedicated one-shot migration Serverless Container.

Migration policy:

- migrations are numbered and checksum-protected;
- applied migrations are never edited;
- schema changes must be backward compatible with the currently running application during rollout;
- database rollback is normally a forward corrective migration, not deletion/rewrite of already-applied history.

## 4. Terraform plan

Use remote state and an operator identity authorized for the required infrastructure changes:

```text
cd infra/terraform/environments/dev
terraform init -backend-config=backend.hcl
terraform plan -out=dev.tfplan
```

Review at minimum:

- no unexpected public IP/public RP/UMK bucket change;
- only intended image digests change for API/worker revisions;
- runtime Lockbox grants remain scoped to explicit secrets;
- API Gateway invokes only the intended API container;
- worker trigger invokes only the intended worker container;
- no broad `editor` role was introduced.

## 5. Apply runtime revision

After migration succeeds and plan review is complete:

```text
terraform apply dev.tfplan
```

Then verify:

- API health through API Gateway;
- login/session/CSRF flow;
- History 9 reference course loads;
- AI proposal reaches `READY` through worker timer;
- authoritative lesson decision remains unchanged until explicit teacher Apply;
- after Apply, reload restores the teacher-approved revision and dependency invalidations.

## 6. Web deployment

Build:

```text
pnpm --filter @tehkarta/web build
```

Upload only `apps/web/dist/**` to the dedicated static web bucket. The bucket is intentionally public-read because Object Storage website hosting requires anonymous reads. RP/UMK and generated-artifact buckets remain private.

After Terraform creates the CDN resource, set DNS CNAME for `web_domain` to the `web_provider_cname` output. Certificate Manager validation must already be complete.

## Rollback

### Application rollback

1. Identify the last known-good API and worker image digests.
2. Set Terraform inputs back to those digests.
3. `terraform plan` and confirm only intended runtime revision changes.
4. Apply.
5. Re-run the critical teacher-authority smoke scenario.

### Schema rollback

Do not edit or delete an applied migration. If the newly deployed application requires a corrective schema change, create a new forward migration. Application changes should follow expand/migrate/contract sequencing so the previous application revision can run during rollback.

### Worker rollback

If AI execution is unsafe but the API should stay online, disable the worker timer/runtime in Terraform while preserving queued jobs. Do not delete proposal/job history merely to stop processing.

## Incident invariants

Even during rollback or partial outage:

- AI must never overwrite an `APPROVED` teacher decision;
- no secret payload is written to Git, frontend bundles or logs;
- no tenant/workspace authorization bypass is introduced;
- stale AI proposals are not applied;
- private PostgreSQL is not made public as an operational shortcut.
