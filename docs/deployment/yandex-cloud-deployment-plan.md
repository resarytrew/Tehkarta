# Полный план развёртывания Tehkarta в Yandex Cloud

**Статус:** план; облачные ресурсы из этого репозитория ещё не создавались
**Дата актуализации:** 24 августа 2026 г.
**Область:** `dev` → `stage` → `prod`, инфраструктура, релиз, миграции, безопасность, наблюдаемость, резервное восстановление и откат
**Источники проекта:** `RULS.md`, `TECHNICAL_DOCUMENTATION.md`, `README.md`, `docs/architecture/*`, `docs/adr/*`, текущий код, миграции, CI и `infra/terraform/*`

> Главный эксплуатационный инвариант Tehkarta сохраняется во всех сценариях релиза и отката: **AI предлагает, педагог решает**. Ошибка worker-а, провайдера, сети, миграции или откат приложения не должны менять `APPROVED`-решение педагога без нового явного действия.

---

## 1. Итоговая рекомендация

Текущий Terraform — хорошая основа для `dev`, но его нельзя применять как production-конфигурацию без доработок. Рекомендуемая последовательность:

1. закрыть обязательные pre-deploy блокеры из раздела 4;
2. создать отдельные folders и Terraform state для `dev`, `stage`, `prod`;
3. сначала развернуть core-инфраструктуру без runtime;
4. настроить OIDC federation, Lockbox, домены и сертификаты;
5. опубликовать immutable API/worker images;
6. выполнить миграции одноразовым task-container внутри VPC;
7. включить API и worker сначала в `dev`, затем в `stage`;
8. пройти полный teacher-authority smoke и restore drill;
9. только после этого развернуть `prod` с HA PostgreSQL, deletion protection, мониторингом и ручным approval gate;
10. после API развернуть web, проверить cookie/CORS/CSRF и открыть DNS-трафик.

Для первого production-релиза оставить PostgreSQL-backed durable queue и timer-trigger worker согласно ADR 0008. Переход на Message Queue/Event Router выполнять только по измеренным latency/throughput, не меняя источник истины и idempotency/stale semantics.

---

## 2. Фактическое состояние репозитория

### Уже реализовано

- pnpm monorepo, Node.js 22, React/Vite, Fastify, PostgreSQL;
- API и worker Docker images, оба запускаются от `USER node`;
- graceful shutdown API и poll-worker;
- durable PostgreSQL queue с lease/retry/idempotency;
- worker `poll` и `once`; облачная схема рассчитана на `once`;
- provider-neutral AI layer, Yandex AI Studio и OpenRouter;
- split DB configuration для API/worker;
- Lockbox secret references в Terraform;
- VPC, private Managed PostgreSQL, private content/artifact buckets;
- Container Registry с отдельными API/worker repositories;
- private API Serverless Container за API Gateway;
- task-mode worker с timer trigger;
- static web bucket + Cloud CDN foundation;
- GitHub Actions CI и ручная публикация immutable SHA image tags через OIDC;
- append-only SQL migrations с advisory lock и checksum verification;
- teacher-authority, tenancy, CSRF и AI proposal integration tests;
- Content/RP/UMK context и teacher-governed content selection уже присутствуют в текущем `main`, хотя верхнеуровневая документация частично называет этот слой следующим этапом.

### Ещё не реализовано или не подтверждено

- реальный `terraform apply` не выполнялся;
- существует только Terraform environment `dev`;
- нет production-grade PostgreSQL topology;
- нет VPC-capable migration image/job;
- нет автоматизированного web publish workflow;
- нет Terraform-модулей для alerts, dashboards, log retention, Audit Trails, budgets;
- нет проверенного production bootstrap для первого владельца workspace;
- нет зафиксированной процедуры ротации секретов и регулярного restore drill;
- нет подтверждённых домена, DNS zone, сертификатов, cloud/folder IDs, квот и бюджета.

---

## 3. Целевая архитектура

```text
Пользователь
   │
   ├── https://app.<domain>
   │        │
   │        └── Cloud CDN
   │               └── public-read Object Storage bucket (только web build)
   │
   └── https://api.<domain>
            │
            └── API Gateway
                   └── private Serverless Container: API
                          ├── Managed PostgreSQL (private, TLS verify-full)
                          ├── private content bucket
                          └── private artifacts bucket

Timer trigger
   └── private task-mode Serverless Container: worker (`WORKER_MODE=once`)
          ├── Managed PostgreSQL durable queue
          └── Yandex AI Studio/OpenRouter over outbound HTTPS

Protected CI/CD environment
   ├── GitHub OIDC → Yandex Workload Identity Federation
   ├── Container Registry: immutable digest images
   ├── Terraform plan/apply
   └── one-shot migration task inside VPC

Cloud Logging + Yandex Monitoring/Monium + Audit Trails
   └── alerts → операторский канал
```

### Обязательное доменное решение

Использовать пару `app.example.ru` и `api.example.ru` либо same-origin routing. Не оставлять production web на пользовательском домене, а API — только на стандартном домене `*.apigw.yandexcloud.net`: session cookie имеет `SameSite=Lax`, и cross-site credentialed fetch будет ненадёжен. Для выбранной схемы:

- API получает custom domain из той же registrable domain;
- `VITE_API_BASE_URL=https://api.example.ru`;
- `CORS_ALLOWED_ORIGINS=https://app.example.ru` без wildcard;
- cookies остаются `Secure`, `HttpOnly`, `SameSite=Lax`, host-only;
- все mutations продолжают требовать CSRF token.

---

## 4. Обязательные pre-deploy блокеры

Все пункты ниже должны быть закрыты до первого production cutover.

### 4.1 Воспроизводимая сборка

- [ ] Создать и закоммитить `pnpm-lock.yaml`.
- [ ] Заменить `pnpm install --no-frozen-lockfile` в CI/Dockerfile на `pnpm install --frozen-lockfile`.
- [ ] Зафиксировать базовые images по digest, а не только `node:22-bookworm-slim` tag.
- [ ] Добавить vulnerability scan, SBOM и fail policy для critical/high уязвимостей с документированными исключениями.
- [ ] Не публиковать `latest`; deployment source of truth — image digest + Git SHA.

### 4.2 Сеть Serverless Containers → PostgreSQL

Текущая PostgreSQL security group разрешает `6432/tcp` только из `10.42.0.0/16`. Согласно [документации Yandex Cloud по сети Serverless Containers](https://yandex.cloud/en/docs/serverless-containers/concepts/networking), containers с user network используют service subnets из `198.19.0.0/16`; этот диапазон нужно учитывать в security groups.

- [ ] Добавить контролируемый ingress `6432/tcp` из `198.19.0.0/16` к PostgreSQL security group.
- [ ] Сохранить три VPC subnet-а — по одному в каждой доступной зоне: это требование serverless networking.
- [ ] Выполнить connection smoke из API и worker revisions, а не только с локальной машины.
- [ ] Убедиться, что worker имеет outbound HTTPS к выбранным AI endpoints.
- [ ] Не выдавать Managed PostgreSQL public IP ради миграций или CI.

### 4.3 TLS к PostgreSQL

Сейчас Terraform задаёт `DB_SSL=require`, а код интерпретирует его как `rejectUnauthorized: false`. Это шифрует канал, но не проверяет CA/имя сервера.

- [ ] Для `stage/prod` использовать `DB_SSL=verify-full`.
- [ ] Доставить актуальный Yandex Cloud CA в read-only path image/revision и задать `DB_SSL_CA_PATH`, либо добавить безопасную загрузку CA при сборке с checksum/version control.
- [ ] Проверить hostname verification с выбранным writer FQDN.
- [ ] Не хранить CA path и credentials как hardcoded domain assumptions в domain/application packages.

### 4.4 Production migrations

Текущий migration runner принимает только `DATABASE_URL` и не использует общий split/TLS config. В API/worker images migrations также не оформлены как отдельный production runtime.

- [ ] Перевести migration runner на общий `databaseConfigFromEnv` или эквивалентный TLS-aware config.
- [ ] Собрать отдельный non-root migration image с `packages/database/migrations/**`.
- [ ] Запускать его как one-shot task Serverless Container внутри той же VPC.
- [ ] Выдать migration identity только DB secret + image pull; AI keys и Object Storage ему не нужны.
- [ ] Сохранять stdout/stderr и exit code в Cloud Logging; failed migration блокирует runtime cutover.
- [ ] Проверить advisory lock и checksum mismatch failure на `stage`.

### 4.5 Production PostgreSQL topology

Текущий `dev` создаёт один PRESTABLE host `s2.micro`, 20 GiB, `deletion_protection=false`, maintenance `ANYTIME`.

- [ ] Создать отдельный `prod` cluster с `environment=PRODUCTION`.
- [ ] Минимум два hosts в разных availability zones; для более строгого SLA/RTO — три hosts в трёх зонах.
- [ ] Включить deletion protection на cluster, user и database.
- [ ] Выбрать production resource preset по нагрузочному тесту, не копировать `s2.micro` автоматически.
- [ ] Настроить backup window и retention; базовая рекомендация — не менее 14–30 дней плюс policy/manual backup перед рискованными миграциями.
- [ ] Настроить scheduled maintenance window в низкую нагрузку.
- [ ] Рассмотреть automatic storage expansion и обязательно alerts на 80/90% использования.
- [ ] Для failover использовать writer FQDN `c-<cluster-id>.rw.mdb.yandexcloud.net` либо расширить клиент до списка hosts + `target_session_attrs=read-write`; текущий first-host FQDN не является production failover strategy.
- [ ] Протестировать reconnect pool-а после controlled failover.

### 4.6 Auth, proxy и публичный edge

- [ ] Убрать автоматическое `trustProxy=true` для любого production запуска; включать доверие к proxy явно и ограниченно под фактический API Gateway path.
- [ ] Проверить, что spoofed `X-Forwarded-For` не позволяет обходить login throttling.
- [ ] Добавить DB-backed `/readyz` для API; `/health` оставить liveness и не выдавать детали инфраструктуры.
- [ ] Ограничить request/body sizes и Gateway quotas в соответствии с текущими API contracts.
- [ ] Проверить security headers и решить судьбу CSP: сейчас `contentSecurityPolicy` отключён.
- [ ] Для login/API abuse настроить edge-level rate controls или документировать, почему достаточно текущего persistent DB throttling; не ослаблять application checks.

### 4.7 Web build

- [ ] Не публиковать production source maps в public bucket; выключить `sourcemap: true` либо загружать maps только в закрытый monitoring pipeline.
- [ ] Собирать web только с production `VITE_API_BASE_URL`; `VITE_DEV_CSRF_TOKEN` и `VITE_DEFAULT_WORKSPACE_ID` должны быть пустыми.
- [ ] Добавить отдельный publish workflow с cache headers: hashed assets — immutable/long TTL, `index.html` — no-cache/short TTL.
- [ ] После upload выполнять CDN purge как минимум для `/index.html` и проверять новую asset graph.
- [ ] Никогда не размещать RP/УМК или generated artifacts в public web bucket.

### 4.8 Первый production пользователь

- [ ] Не запускать `db:bootstrap-dev` в production: код намеренно запрещает это.
- [ ] Реализовать одноразовую audited admin/owner bootstrap operation или invitation flow.
- [ ] Передавать initial credential через защищённый канал и требовать немедленную смену/ротацию.
- [ ] Зафиксировать, кто и когда создал первый workspace и OWNER membership.

---

## 5. Разделение окружений

Рекомендуемая иерархия:

```text
Yandex Cloud
├── folder: tehkarta-bootstrap/state
├── folder: tehkarta-dev
├── folder: tehkarta-stage
└── folder: tehkarta-prod
```

Для каждого окружения отдельно:

- Terraform state key и apply lock/serialization;
- VPC, PostgreSQL, Lockbox secrets, runtime identities;
- API/worker revisions;
- private buckets и web bucket;
- domains/certificates;
- dashboards, alerts и budgets;
- GitHub protected environment и approval policy.

Не использовать один PostgreSQL cluster, Lockbox secret или artifact bucket одновременно для `stage` и `prod`.

### Terraform layout

Добавить:

```text
infra/terraform/environments/
├── dev/
├── stage/
└── prod/
```

Общие modules остаются переиспользуемыми, но environment roots задают разные topology/policies. Не копировать production значения в `dev` defaults и наоборот.

---

## 6. Облачный bootstrap

### 6.1 Организация, billing и квоты

- [ ] Подтвердить Yandex Cloud organization, active billing account, cloud и folders.
- [ ] Назначить владельцев, incident contacts и минимум двух break-glass администраторов.
- [ ] Проверить quotas для Managed PostgreSQL, Serverless Containers, API Gateway, Container Registry, Lockbox, Object Storage, CDN и Monitoring.
- [ ] Создать budgets/notifications по каждому folder; отдельно контролировать PostgreSQL, CDN egress, AI и logging volume.
- [ ] Зафиксировать регион `ru-central1` и допустимые availability zones с учётом текущей доступности сервисов.

### 6.2 Remote Terraform state

- [ ] Создать отдельный private versioned Object Storage bucket для state.
- [ ] Запретить anonymous access, включить server-side encryption/KMS и `prevent_destroy`.
- [ ] Ограничить state identity только нужным bucket/prefix.
- [ ] Настроить backend отдельно для каждого environment.
- [ ] Включить поддерживаемый механизм locking либо строго сериализовать applies через protected GitHub environment; не допускать конкурентные apply.
- [ ] Не хранить state credentials в Git. Предпочесть short-lived identity; если backend требует S3 access keys, хранить и ротировать их как отдельный bootstrap secret.
- [ ] Проверить восстановление предыдущей версии state до первого production apply.

### 6.3 Workload Identity Federation

- [ ] Создать deploy service account для каждого окружения.
- [ ] Создать GitHub OIDC federation: issuer `https://token.actions.githubusercontent.com`, официальный JWKS URL, явно выбранный audience.
- [ ] Federated credential ограничить точным GitHub subject защищённого environment (`dev`, `stage`, `prod`), а не всеми jobs репозитория.
- [ ] Разделить identities: image publisher, infra planner/applier, web publisher; не выдавать одному account постоянный `editor`.
- [ ] Для `prod` включить required reviewers и запрет self-approval, если это поддерживает процесс команды.
- [ ] Проверить token exchange и немедленно убедиться, что long-lived static service-account key не создавался.

---

## 7. IAM и секреты

### Матрица минимальных доступов

| Identity | Нужные возможности | Не нужны |
|---|---|---|
| API runtime | pull API image; read API Lockbox refs; private DB; ограниченный доступ к content/artifacts | AI provider key, Terraform state, deploy rights |
| Worker runtime | pull worker image; DB; только реально используемые AI keys | web bucket, deploy rights, OWNER data access |
| Worker trigger | invoke конкретный worker container | Lockbox, DB, Registry push |
| Gateway runtime | invoke конкретный API container | DB, Lockbox, buckets |
| Migration runtime | pull migration image; DB password; connect to private DB | AI keys, web publish |
| Image publisher | push API/worker/migration images | DB, Lockbox payloads, Terraform state |
| Web publisher | write только web bucket; purge конкретный CDN resource | private content/artifacts, DB |
| Terraform applier | управлять только ресурсами environment по утверждённому plan | application data |

### Lockbox

Минимальные production secrets:

- `DB_PASSWORD`;
- `AUTH_IP_HASH_KEY` длиной не менее 32 символов;
- `YANDEX_AI_API_KEY` и/или `OPENROUTER_API_KEY` только для явно выбранных routes;
- при необходимости S3/backend bootstrap credentials, отдельно от runtime.

Требования:

- [ ] отдельные secrets/versions на environment;
- [ ] secret payload никогда не попадает в tfvars, state, GitHub output, frontend или логи;
- [ ] runtime получает ссылку `id/version_id/key`;
- [ ] доступ выдаётся на конкретный secret, не folder-wide;
- [ ] если Lockbox secret защищён KMS key, runtime получает также минимальный `kms.keys.encrypterDecrypter` на конкретный key;
- [ ] ротация создаёт новую version и новую container revision;
- [ ] проверить поведение кэша секретов Serverless Containers при revoke/rotation;
- [ ] quarterly access review и documented emergency rotation.

Примечание: перед production запуском отдельно принять риск того, что [передача Lockbox secrets в Serverless Containers](https://yandex.cloud/en/docs/lockbox/operations/serverless/containers) отмечена Yandex Cloud как Preview на дату этого документа. Если политика организации запрещает Preview, выбрать другой согласованный secret-delivery adapter, не передавая secrets во frontend/domain layer.

---

## 8. Доработка Terraform

### Общие modules

- [ ] `network`: добавить serverless service CIDR для DB ingress, документировать egress.
- [ ] `postgres`: поддержать список hosts/zones, PRODUCTION topology, backup settings/policies, scheduled maintenance, deletion protection, storage autoscaling, writer endpoint output.
- [ ] `storage`: KMS encryption для private buckets, `prevent_destroy` для artifacts, lifecycle/retention по классам данных.
- [ ] `serverless-api`: explicit resource sizing, API readiness strategy, log group/retention, более узкие storage grants.
- [ ] `serverless-worker`: log group/retention, monitoring labels, возможность безопасно отключить timer без удаления queue history.
- [ ] новый `migration-task` module.
- [ ] `web-cdn`: explicit cache policy, compression/security headers, CDN resource output для purge automation.
- [ ] новые modules или environment resources: Certificate Manager, DNS records при подтверждённой zone ownership, Monitoring alerts, notification channels, Audit Trails, budgets.

### Production defaults

- [ ] public/runtime switches по-прежнему defaults `false`;
- [ ] image digest обязателен, tag используется только как metadata;
- [ ] `deletion_protection=true`;
- [ ] private DB, private content/artifacts;
- [ ] минимум 2 DB hosts;
- [ ] `DB_SSL=verify-full`;
- [ ] только production origins;
- [ ] explicit AI models и versioned routing policy;
- [ ] environment labels и owner/cost-center labels.

### Terraform quality gates

```bash
terraform fmt -check -diff -recursive infra/terraform
cd infra/terraform/environments/<env>
terraform init -backend=false -input=false
terraform validate -no-color
```

В release pipeline дополнительно:

```bash
terraform init -backend-config=backend.hcl -input=false
terraform plan -out=<env>.tfplan
terraform show -no-color <env>.tfplan > <env>.tfplan.txt
```

Plan сохраняется как protected artifact. Apply выполняется только для этого бинарного plan после review; повторный plan между approval и apply не подменяет утверждённый результат.

---

## 9. Сборка и публикация images

### PR gate

Существующие проверки сохранить обязательными:

```bash
pnpm typecheck
pnpm build
pnpm test
pnpm db:smoke
docker build -f apps/api/Dockerfile .
docker build -f apps/worker/Dockerfile .
terraform fmt -check -recursive infra/terraform
terraform init -backend=false
terraform validate
```

Дополнить migration image build, lockfile enforcement, vulnerability scan и secret scan.

### Release artifact

Для Git SHA `<sha>` публикуются:

```text
cr.yandex/<registry-id>/api:<sha>       + sha256 digest
cr.yandex/<registry-id>/worker:<sha>    + sha256 digest
cr.yandex/<registry-id>/migration:<sha> + sha256 digest
web-dist-<sha>                          + manifest/checksum
```

Release manifest должен содержать:

- Git SHA и tag/release ID;
- image digests;
- migration set/checksums;
- web manifest checksum;
- Terraform commit SHA;
- build timestamp и CI run URL;
- routing policy version и выбранные provider/model identifiers без keys.

Registry lifecycle policy должна сохранять все digests, на которые ещё ссылается active или rollback revision. Нельзя удалять last-known-good image только потому, что он вышел из top-30.

---

## 10. Пошаговое развёртывание первого окружения

### Фаза A — core без runtime

1. Скопировать ignored `terraform.tfvars` и `backend.hcl` для окружения.
2. Заполнить только non-secret IDs, naming, zones и core topology.
3. Оставить:

   ```hcl
   enable_api_runtime    = false
   enable_worker_runtime = false
   enable_web_runtime    = false
   ```

4. Выполнить `terraform plan` и review.
5. Создать VPC/subnets/security groups, private buckets, PostgreSQL, Registry и identities.
6. Записать outputs как protected deployment variables, не как secrets в Git.
7. Проверить: DB без public IP; private buckets без anonymous access; deletion protection соответствует environment.

### Фаза B — federation, secrets, certificates

1. Настроить GitHub environment и OIDC federation.
2. Создать/найти Lockbox versions.
3. Создать `app.<domain>` и `api.<domain>` certificates в Certificate Manager.
4. Пройти DNS validation сертификатов.
5. Подготовить exact CORS origin и custom API domain.
6. Проверить service account grants через отдельный IAM review.

### Фаза C — images и миграции

1. Запустить `Publish dev/stage/prod images` для выбранного green commit.
2. Получить digest каждого image и записать release manifest.
3. Развернуть migration task по digest.
4. Перед risk migration создать manual DB backup.
5. Запустить migration task один раз.
6. Проверить exit code, Cloud Logging и `schema_migrations` checksums.
7. При ошибке остановить релиз; не включать новую runtime revision.

### Фаза D — API

1. Задать API image digest и Lockbox references.
2. Указать production DB writer FQDN, port `6432`, `DB_SSL=verify-full`, CA path.
3. Указать exact CORS origins, `NODE_ENV=production`, explicit proxy policy.
4. Включить API runtime и custom API Gateway domain.
5. Apply reviewed plan.
6. Проверить default gateway URL только технически; пользовательский traffic вести через custom API domain.
7. Smoke: `/health`, `/readyz`, login, `/api/v1/me`, credentialed CORS, logout, CSRF rejection.

### Фаза E — worker

1. Задать worker image digest.
2. Явно задать обе routes:

   ```text
   AI_VARIANTS_PROVIDER / AI_VARIANTS_MODEL
   AI_REFORMULATE_PROVIDER / AI_REFORMULATE_MODEL
   AI_ROUTING_POLICY_VERSION
   ```

3. Передать только keys реально используемых providers.
4. Сначала создать worker container с timer disabled либо большим interval.
5. Выполнить ручной once-invocation и проверить DB/provider connectivity.
6. Включить timer; cron Yandex Cloud интерпретируется в UTC.
7. Проверить `QUEUED → RUNNING → READY`, stale-before-model и bounded retry.

### Фаза F — web

1. Собрать:

   ```bash
   VITE_API_BASE_URL=https://api.<domain> pnpm --filter @tehkarta/web build
   ```

2. Проверить bundle secret scan и отсутствие dev values/source maps.
3. Upload hashed assets с immutable cache headers.
4. Upload `index.html` последним с short/no-cache.
5. Purge `/index.html` в CDN.
6. Настроить DNS CNAME `app.<domain>` → `web_provider_cname`.
7. Проверить HTTPS chain, SPA fallback, asset loading и новый release manifest.

### Фаза G — первый OWNER и acceptance

1. Выполнить audited production bootstrap/invitation.
2. Войти как педагог.
3. Пройти полный acceptance checklist из раздела 13.
4. Только после успешного smoke открыть доступ пилотной группе.

---

## 11. CI/CD promotion model

```text
PR green
   ↓
merge main
   ↓
build once + immutable digests
   ↓
deploy dev
   ↓ automated smoke
promote the same digests
   ↓
deploy stage
   ↓ full E2E + migration/failover/restore checks
manual prod approval
   ↓
prod backup → migration → API/worker → web → smoke
```

Не пересобирать source между `stage` и `prod`: продвигаются те же image digests и тот же web artifact. Environment-specific значения передаются runtime/build configuration, secrets не встраиваются в images.

Для schema changes соблюдать expand → deploy → backfill → switch reads → contract. Contract migration выпускается отдельным поздним релизом после завершения rollback window.

---

## 12. Наблюдаемость и эксплуатация

### Логи

- API/worker пишут single-line structured JSON в stdout/stderr;
- обязательные поля: request ID, job ID, proposal ID, aggregate/lesson ID, error class, latency, provider/model metadata;
- исключить password, raw session/CSRF token, API keys, полный prompt, PII и полный лицензированный УМК-текст;
- задать log retention по environment и оценить стоимость;
- настроить saved queries по `requestId`, `jobId`, `proposalId`.

### Метрики и alerts

Минимальный набор:

- API/worker container errors, execution time, starts/finishes, memory;
- timer trigger errors/access errors и отсутствие успешных invocation;
- API 5xx/4xx rate и latency;
- PostgreSQL alive/primary, CPU, memory, connections, query latency, fatal/log errors;
- replication lag: warning 5 s, alarm 60 s как начальная официальная рекомендация;
- disk usage: warning 80%, alarm 90%; operational action до перехода в read-only;
- queue depth, oldest queued age, RUNNING lease age, FAILED jobs;
- AI provider latency/error/rate-limit, tokens/cost;
- certificate expiry/validation, CDN 4xx/5xx;
- backup age и restore drill freshness.

Создать dashboards: `Platform`, `PostgreSQL`, `Async jobs/AI`, `Security/Auth`, `Cost`.

### Audit Trails

Экспортировать control-plane audit events в отдельный защищённый destination. Контролировать изменения IAM, Lockbox, Registry, Serverless Containers, API Gateway, PostgreSQL, buckets, certificates и Terraform identities. Доступ к audit data отделить от runtime identities.

### SLO для первого production

До запуска владелец продукта утверждает:

- API availability target;
- p95 latency для non-AI endpoints;
- максимальное время от `QUEUED` до начала worker job;
- AI completion target отдельно от API availability;
- RPO/RTO для PostgreSQL;
- incident response time и канал эскалации.

Не смешивать AI provider outage с потерей authoritative lesson state: API может оставаться доступным, proposal/job получает контролируемый failure, lesson не меняется.

---

## 13. Acceptance checklist

### Инфраструктура

- [ ] `terraform plan` не создаёт неожиданных public resources.
- [ ] PostgreSQL private и доступен только из одобренных paths.
- [ ] content/artifacts private; anonymous read/list/config disabled.
- [ ] только web bucket public-read.
- [ ] runtime service accounts раздельны и least privilege.
- [ ] image revisions закреплены digest-ами.
- [ ] certificates valid, DNS correct, HTTP redirect to HTTPS.
- [ ] backups, alerts, budgets и log retention активны.

### Приложение

- [ ] API liveness и DB readiness.
- [ ] login unknown-email/wrong-password не даёт различимого public error.
- [ ] Secure/HttpOnly cookie проходит между `app` и `api`.
- [ ] CORS разрешает только ожидаемый web origin.
- [ ] mutation без CSRF получает отказ.
- [ ] workspace A не читает/не изменяет workspace B.
- [ ] stale version возвращает controlled `409`.
- [ ] reload сохраняет authoritative revision.

### Критический teacher-authority E2E

Использовать benchmark:

> «Почему в XIX в. промышленная революция достигла огромных успехов?»

- [ ] edit → approve сохраняет `APPROVED`;
- [ ] AI request создаёт отдельный proposal/job;
- [ ] worker получает approved-only context;
- [ ] READY candidate не меняет lesson;
- [ ] stale proposal не вызывает модель или не применяется;
- [ ] только explicit Apply создаёт новую `TEACHER + APPROVED` revision;
- [ ] AI provenance сохраняется отдельно;
- [ ] dependent artifacts получают stale markers;
- [ ] reload и повторный login возвращают то же утверждённое значение;
- [ ] provider timeout/failure оставляет lesson неизменным.

### RP/УМК

- [ ] private source content не доступен по public URL;
- [ ] workspace scope сохранён;
- [ ] source provenance/version не потеряны;
- [ ] AI reconstruction не маркируется как authentic source;
- [ ] content selection становится authoritative только через teacher action.

---

## 14. Backup, restore и disaster recovery

### PostgreSQL

- automatic backups + PITR retention по утверждённому RPO;
- manual backup перед risk migrations;
- ежеквартальный restore в изолированный folder/VPC;
- после restore: checksum migrations, tenant isolation, teacher-authority smoke, queue consistency;
- фиксировать фактические restore duration и recovered point, обновлять RTO/RPO.

Managed PostgreSQL restore создаёт новый cluster. Runbook должен включать обновление DB host/Lockbox reference, новую runtime revision и controlled cutover.

### Object Storage

- versioning для content/artifacts/web/state;
- KMS encryption для private/state buckets;
- retention/lifecycle отдельно для source content, exports, temporary artifacts и web versions;
- `prevent_destroy` для state/content и production artifacts;
- периодическая проверка чтения старой object version и checksum.

### Terraform и конфигурация

- versioned remote state;
- release manifests и last-known-good digests;
- экспорт критичной конфигурации без secret payload;
- documented recreation order: IAM/state → network → DB restore → secrets → migration check → API → worker → web/DNS.

---

## 15. Откат

### API/worker

1. Остановить promotion.
2. При unsafe AI execution отключить timer, но не удалять `async_jobs`/proposal history.
3. Вернуть Terraform inputs на last-known-good digests.
4. Review plan: только ожидаемые runtime revisions/config.
5. Apply и пройти critical teacher-authority smoke.

### Web

1. Восстановить предыдущую version `index.html` и соответствующий asset manifest.
2. Purge `index.html` в CDN.
3. Проверить совместимость со старой/новой API schema.

### Database

- не редактировать и не удалять applied migration;
- для логической ошибки — новая forward corrective migration;
- PITR/cluster restore — только для сценария потери/массового повреждения данных по incident decision;
- application rollback должен оставаться возможен благодаря expand-contract window.

### Неизменяемые incident rules

- не делать БД public как shortcut;
- не отключать tenant/CSRF checks;
- не применять stale AI proposal;
- не удалять job/proposal/revision history ради «очистки»;
- не выводить secrets в debug logs;
- не считать rollback завершённым без проверки teacher-approved state.

---

## 16. Capacity и стоимость

До production заполнить capacity sheet:

- MAU/DAU и peak concurrent users;
- API RPS и p95 response time;
- PostgreSQL connections/CPU/RAM/storage/WAL growth;
- AI jobs per minute, average duration/tokens/cost;
- queue depth/oldest age;
- content/artifact storage и CDN egress;
- log ingestion/retention;
- RPO/RTO и цена HA topology.

Начальные значения API/worker `512 MiB / 1 core / 100%` и DB `s2.micro / 20 GiB` являются dev defaults, а не production sizing. Провести load test на `stage`, затем зафиксировать production preset, pool limits и budget thresholds. Проверить, что суммарный `DB_POOL_MAX × возможное число container instances` не превышает безопасный connection budget pooler-а.

Timer worker `одна job в минуту` даёт низкий throughput. Сначала измерять `oldest queued age`; переход к более частому timer/batched execution/Message Queue выполнять только после подтверждённой необходимости и отдельного ADR.

---

## 17. Go-live gates

### Gate 1 — code ready

- green CI;
- lockfile/frozen install;
- migration image;
- production config gaps закрыты;
- no secrets/source maps in artifacts.

### Gate 2 — cloud ready

- folders/state/IAM/federation;
- domains/certificates;
- private networking и TLS verify-full;
- HA DB/backups/deletion protection;
- alerts/audit/budgets.

### Gate 3 — stage proven

- full E2E;
- load test;
- failover/reconnect test;
- restore drill;
- rollback rehearsal;
- AI outage leaves lessons unchanged.

### Gate 4 — production cutover

- approved binary Terraform plan;
- manual backup;
- migrations successful;
- same tested digests promoted;
- API/worker/web smoke green;
- operator on duty и rollback inputs готовы.

Production релиз считается завершённым только после post-deploy observation window и письменной фиксации результата, а не сразу после `terraform apply`.

---

## 18. Рекомендуемый порядок работ

1. **PR A — supply chain:** lockfile, frozen installs, pinned base images, scan/SBOM.
2. **PR B — runtime security:** explicit trust proxy, API readiness, CSP decision, production source maps off.
3. **PR C — DB connectivity:** serverless CIDR, verify-full CA, writer endpoint/multi-host support.
4. **PR D — migrations:** TLS-aware migration runner + migration Docker image/task module.
5. **PR E — environments:** parameterize PostgreSQL module, add `stage`/`prod`, remote state policy.
6. **PR F — IAM/secrets:** federation resources/process, KMS grants, bucket-scoped permissions.
7. **PR G — observability/DR:** logs, alerts, Audit Trails, budgets, backup policies/runbooks.
8. **PR H — web release:** immutable artifact workflow, cache headers, CDN purge, release manifest.
9. **PR I — production bootstrap:** audited initial OWNER/invitation flow.
10. **Operator run:** bootstrap core → secrets/certs → dev → stage → drills → prod.

Каждый PR должен быть небольшим и coherent; изменение deployment topology сопровождается обновлением `TECHNICAL_DOCUMENTATION.md` и deployment docs.

---

## 19. Официальные источники Yandex Cloud

- [Networking in Serverless Containers](https://yandex.cloud/en/docs/serverless-containers/concepts/networking)
- [Timer trigger for Serverless Containers](https://yandex.cloud/en/docs/serverless-containers/concepts/trigger/timer)
- [Serverless Containers metrics](https://yandex.cloud/en/docs/serverless-containers/metrics)
- [Serverless Containers logs](https://yandex.cloud/en/docs/serverless-containers/concepts/logs)
- [Lockbox secrets in Serverless Containers](https://yandex.cloud/en/docs/lockbox/operations/serverless/containers)
- [Workload Identity Federation](https://yandex.cloud/en/docs/iam/concepts/workload-identity)
- [GitHub/OIDC federation setup](https://yandex.cloud/en/docs/iam/operations/wlif/setup-wlif)
- [Managed PostgreSQL connection and CA](https://yandex.cloud/en/docs/managed-postgresql/operations/connect/)
- [Connecting to Managed PostgreSQL with `verify-full`](https://yandex.cloud/en/docs/managed-postgresql/operations/connect/clients)
- [Managed PostgreSQL high availability](https://yandex.cloud/en/docs/managed-postgresql/concepts/high-availability)
- [Managed PostgreSQL cluster topology](https://yandex.cloud/en/docs/managed-postgresql/concepts/planning-cluster-topology)
- [Managed PostgreSQL backups and PITR](https://yandex.cloud/en/docs/managed-postgresql/concepts/backup)
- [Managed PostgreSQL monitoring and alerts](https://yandex.cloud/en/docs/managed-postgresql/operations/monitoring)
- [Object Storage encryption](https://yandex.cloud/en/docs/storage/concepts/encryption)
- [Static website in Object Storage](https://yandex.cloud/en/docs/storage/tutorials/static/)
- [Cloud CDN cache configuration](https://yandex.cloud/en/docs/cdn/operations/resources/configure-caching)
- [Cloud CDN cache purge](https://yandex.cloud/en/docs/cdn/api-ref/Cache/purge)
- [API Gateway custom domains](https://yandex.cloud/en/docs/api-gateway/concepts/)

---

## 20. Внешние решения, которые должен предоставить владелец

До реального deploy нужны конкретные ответы и доступы:

1. Yandex organization/cloud/folder и billing owner;
2. production domain и DNS ownership;
3. допустимый бюджет и HA/RPO/RTO;
4. основной AI provider/model routes и лимиты расходов;
5. список production операторов и notification channels;
6. policy по Preview-функции Lockbox secret injection;
7. права/лицензии и retention для RP/УМК;
8. способ безопасного создания первого OWNER;
9. GitHub repository/environment policy и reviewers.

Без этих решений можно завершить код, Terraform validation и `dev/stage`, но нельзя честно считать production deployment завершённым.
