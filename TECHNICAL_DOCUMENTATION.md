# ПОЛНАЯ ТЕХНИЧЕСКАЯ ДОКУМЕНТАЦИЯ TEHKARTA

**Версия документа:** 2.0  
**Версия платформы:** 0.1.0 vertical-slice foundation  
**Последнее обновление:** 24 августа 2026 г.  
**Статус:** активная разработка · системное планирование курса, source ingestion, teacher workflow, AI proposal execution и Methodical Constructor v1 реализованы
**Целевая инфраструктура:** Yandex Cloud

> Tehkarta — AI-среда совместного педагогического проектирования образовательного процесса: **курс → раздел → урок → этап → задания и материалы**.
>
> Главный системный принцип: **AI предлагает. Педагог решает. Платформа гарантирует, что утверждённое решение педагога не будет молча переписано дальше по цепочке.**

---

## 1. Назначение платформы

Tehkarta проектируется не как генератор «готовой технологической карты одним кликом», а как teacher-first среда педагогического проектирования.

Базовый поток:

```text
Предмет
→ загрузка рабочей программы / учебника / пособий
→ утверждаемый план курса и прогрессия результатов
→ память освоенного на предыдущих уроках
→ педагогический профиль
→ параметры урока
→ цель и результаты
→ методический конструктор
→ содержание РП/УМК
→ сценарий урока
→ материалы
→ экспертиза
→ технологическая карта
```

Центральная иерархия:

```text
КУРС
└── РАЗДЕЛ
    └── УРОК
        └── ЭТАП УРОКА
            └── МАТЕРИАЛЫ / ЗАДАНИЯ / ОЦЕНИВАНИЕ
```

Платформа должна хранить педагогические решения как управляемое состояние, а не как одноразовый текстовый ответ модели.

---

## 2. Главные архитектурные инварианты

### 2.1 Teacher authority

Каждое управляемое педагогическое поле проходит состояния:

```text
AI_PROPOSED / PROPOSED
        ↓ teacher edit
EDITED
        ↓ explicit Apply / Approve
APPROVED
```

`APPROVED` означает authoritative state. AI не имеет права автоматически заменить такое поле.

Источники значений:

- `AI`;
- `TEACHER`;
- `CURRICULUM`;
- `UMK`;
- `SYSTEM`.

После явного применения AI-кандидата authoritative значение сохраняется как `source=TEACHER`, `status=APPROVED`; AI provenance хранится отдельно.

### 2.2 Approved-only downstream context

Генерация и рекомендации нижних уровней используют только утверждённые решения.

Неутверждённые draft/AI proposal значения не должны становиться скрытым контекстом следующих этапов.

### 2.3 Dependency invalidation

Изменение утверждённого upstream-решения не запускает молчаливую регенерацию нижних блоков.

Вместо этого связанные артефакты получают stale/invalidation marker. Педагог видит влияние изменения и сам решает, что пересчитывать или подтверждать заново.

### 2.4 Proposal is not decision

AI candidate и authoritative lesson decision — разные сущности и разные таблицы.

```text
lesson_ai_proposals ≠ lesson_decisions
```

Постановка AI job, выполнение worker-а и получение READY result сами по себе не меняют lesson state.

### 2.5 Method ≠ Technique ≠ Form

Методический слой строго разделяет:

```text
Педагогическая технология
→ Метод
→ Приём
→ Форма организации
```

Например, групповая работа — организационная форма, а не педагогический метод.

---

## 3. Архитектурный стиль

Tehkarta развивается как **modular monolith first**.

Это позволяет:

- сохранять строгие доменные границы;
- не создавать распределённую сложность раньше времени;
- позже вынести тяжёлые worker/importer процессы без переписывания domain/application contracts;
- тестировать критические инварианты в одном репозитории.

Основные слои:

```text
apps/web
    ↓ HTTP
apps/api
    ↓ use cases
packages/application
    ↓ ports
packages/domain     packages/ports
    ↑                       ↑
packages/database   packages/ai / packages/identity
    ↑
PostgreSQL

async_jobs
    ↓
apps/worker
    ↓
packages/application + packages/ai
```

---

## 4. Технологический стек

### Frontend

- React;
- TypeScript;
- Vite;
- обычный CSS с отдельными компонентными слоями;
- cookie-based session authentication;
- CSRF token для mutations.

### API

- Node.js 22;
- TypeScript;
- Fastify;
- `@fastify/cookie`;
- `@fastify/cors`;
- `@fastify/helmet`.

### Persistence

- PostgreSQL;
- versioned SQL migrations;
- optimistic concurrency по lesson version / field revision;
- транзакции для критических authoritative mutations;
- `SELECT ... FOR UPDATE` там, где требуется защита от гонок;
- `FOR UPDATE SKIP LOCKED` для durable async queue.

### Authentication

- Argon2id password hashing;
- opaque server-side sessions;
- raw session token не хранится в БД;
- HttpOnly cookie;
- CSRF token;
- workspace membership authorization;
- persistent login throttling по HMAC principal/IP identifiers.

### AI

- provider-neutral contracts;
- Yandex AI Studio OpenAI-compatible adapter;
- OpenRouter adapter;
- explicit routing policy;
- structured output validation;
- no silent provider/model fallback;
- retry только для retryable classes;
- timeout / AbortSignal;
- invocation traceability.

### Infrastructure

- Docker;
- Terraform;
- Yandex Cloud target;
- Serverless Containers;
- API Gateway;
- Managed PostgreSQL;
- Object Storage;
- Container Registry;
- Lockbox;
- Cloud CDN foundation;
- IAM/service accounts.

---

## 5. Структура репозитория

```text
Tehkarta/
├── apps/
│   ├── api/                Fastify HTTP API
│   ├── web/                React teacher workspace
│   └── worker/             durable AI job runtime
├── packages/
│   ├── domain/             pure pedagogical/domain model
│   ├── application/        use cases + repository contracts
│   ├── ports/              cross-boundary contracts/context
│   ├── database/           PostgreSQL adapters + migrations
│   ├── identity/           sessions/password/authz
│   └── ai/                 provider adapters + routing
├── infra/
│   └── terraform/          Yandex Cloud IaC
├── docs/
│   ├── adr/                architecture decisions
│   ├── architecture/       architecture notes
│   └── WORK_PLAN_24H.md    completed implementation checkpoint
├── RULS.md                 mandatory rules for AI coding agents
└── TECHNICAL_DOCUMENTATION.md
```

---

## 6. Domain model

Ключевые сущности:

- `Course`;
- `CoursePlan`;
- `CourseLessonProgression`;
- `CourseSourceDocument`;
- `ApprovedCourseLessonContext`;
- `Section`;
- `Lesson`;
- `GovernedField<T>`;
- `PedagogicalProfile`;
- `DesignFreedom`;
- `CurriculumRequirement`;
- `UmkEvidence`;
- `ApprovedLessonContext`;
- `MethodologyPack`;
- `MethodDefinition`;
- `TechniqueDefinition`;
- `OrganizationalFormDefinition`.

Урок хранит, среди прочего:

```text
goal
problemQuestion
bigIdea
outcomes[]
selectedMethods[]
selectedTechniques[]
selectedForms[]
contentItems[]
```

Управляемые поля содержат revision metadata:

```text
revision
source
status
updatedAt / updatedBy
approvedAt / approvedBy
```

---

## 7. Lesson decision governance

### Основные операции

Для core decisions (`goal`, `problemQuestion`, `bigIdea`) API поддерживает:

- edit/save draft;
- explicit approve;
- AI proposal request;
- AI proposal detail/history;
- explicit candidate Apply;
- explicit proposal Dismiss.

Любая mutation проходит:

```text
session
→ workspace resolution
→ authorization
→ CSRF
→ optimistic concurrency
→ application use case
→ persistence
```

### Сохранение ревизий

`lesson_decisions` хранит актуальное состояние.

`lesson_decision_revisions` хранит immutable revision history.

База дополнительно защищает критический teacher-authority invariant от некорректного AI overwrite.

---

## 8. AI Proposal Engine

### 8.1 Lifecycle

```text
QUEUED
  ↓
RUNNING
  ├── READY
  ├── STALE
  └── FAILED

READY
  ├── APPLIED
  └── DISMISSED
```

Также поддерживается terminal `CANCELLED` для соответствующих сценариев.

### 8.2 Создание proposal

Teacher request сохраняет отдельный `lesson_ai_proposals` record и durable async job.

В proposal фиксируются:

- workspace/lesson;
- semantic key;
- action (`VARIANTS`, `REGENERATE`, `IMPROVE`);
- requested lesson version;
- base decision / revision;
- teacher instruction;
- idempotency key;
- provider/model/prompt/routing metadata после выполнения;
- candidates;
- terminal status;
- apply/dismiss provenance.

### 8.3 Worker safety

Перед вызовом модели worker повторно проверяет актуальность lesson/decision context.

Если request stale, модель не вызывается.

AI получает структурированный approved-only context, а не произвольную историю чата.

### 8.4 Explicit Apply

`READY` candidate не становится authoritative автоматически.

Apply повторно проверяет:

- workspace;
- lesson;
- current lesson version;
- base decision id/revision;
- proposal status;
- selected candidate.

Затем authoritative revision сохраняется как teacher action вместе с dependency invalidations и AI provenance.

---

## 9. AI provider layer

Поддержаны два explicit provider path:

- Yandex AI Studio OpenAI-compatible API;
- OpenRouter.

Router не выполняет скрытый fallback. Если требуемый route/provider/model не настроен, запрос завершается контролируемой ошибкой.

Классы provider errors различают, в частности:

- timeout;
- network;
- rate limit;
- upstream 5xx;
- authentication;
- permission;
- invalid request;
- invalid response.

Retry выполняется только для временных классов ошибок. `Retry-After` учитывается, когда доступен.

Сохраняемая traceability включает:

- proposal id;
- task type;
- provider;
- model;
- prompt version;
- routing policy version;
- approved-context input hash;
- latency;
- token usage;
- cost metadata, когда возвращается провайдером;
- request/provider identifiers;
- success/error category.

Remote response body и секреты не должны попадать в application logs.

---

## 10. `apps/worker`

Worker — отдельный production runtime.

Режимы:

- `WORKER_MODE=poll` — постоянный локальный/контейнерный poller;
- `WORKER_MODE=once` — обработка одной доступной задачи для scheduler/task-mode запуска.

Runtime поддерживает:

- stable `WORKER_ID`;
- lease-based claim;
- bounded retry/backoff;
- recovery просроченного lease;
- graceful `SIGTERM/SIGINT`;
- `/healthz`;
- PostgreSQL-backed `/readyz` в poll mode;
- безопасные structured logs без prompt/lesson content/secrets.

Docker image запускается от `USER node`.

---

## 11. Methodical Constructor v1

### 11.1 Назначение

Methodical Constructor связывает утверждённый педагогом результат с педагогической технологией и конкретным методом, не смешивая метод с приёмом или формой организации.

```text
APPROVED OUTCOME
      ↓
Methodology Pack
      ↓
Technology Phase
      ↓
Method recommendation
      ↓
Techniques
      ↓
Organizational Form
      ↓
explicit teacher Use / Reject
```

### 11.2 Versioned Methodology Pack

Первая реализация — исследовательская технология.

Pack содержит:

- technology metadata;
- canonical phases;
- methods;
- techniques;
- compatible organizational forms;
- typical time ranges;
- preparation requirements;
- constraints;
- anti-patterns.

Текущие методы включают:

- анализ источников;
- сравнительный метод;
- статистический метод;
- картографический метод;
- моделирование;
- проверку гипотез.

Приёмы включают, среди прочего:

- постановку гипотезы;
- паспорт источника;
- таблицу доказательств;
- `факт → доказательство → вывод`;
- конкурирующие гипотезы;
- мини-вывод;
- cross-check.

Формы включают индивидуальную, парную, групповую, фронтальную работу и ротацию групп.

### 11.3 Recommendation engine

Baseline engine deterministic/explainable и использует `APPROVED outcomes`, утверждённый план курса, освоенные понятия предыдущих уроков, текущую/следующие темы и доступность разрешённых источников.

Примеры rule-based compatibility:

- causal explanation → hypothesis testing;
- source/document analysis → source analysis;
- comparison → comparative;
- statistics/data → statistical;
- map/spatial work → cartographic;
- model/system → modeling.

Утверждённый проблемный вопрос может усиливать объяснение рекомендации, но не подменяет outcome.

Recommendation ID имеет стабильный router-safe формат и не содержит весь длинный provenance key в URL.

### 11.4 Teacher application

`Использовать` создаёт новые governed decisions:

```text
method      source=TEACHER status=APPROVED
techniques  source=TEACHER status=APPROVED
form        source=TEACHER status=APPROVED
```

После этого downstream content/stage/material/assessment/homework/final conclusion получают stale markers.

`Не использовать` не удаляет knowledge из Methodology Pack: оно сохраняет teacher feedback в `lesson_methodology_feedback` и скрывает отклонённую рекомендацию для текущего контекста/pack.

### 11.5 Web UI

Шаг `03 Методический конструктор` доступен в lesson workspace.

Педагог видит:

- утверждённые outcomes;
- technology / phase;
- метод;
- rationale;
- тип результата;
- estimated time;
- предлагаемые techniques;
- compatible forms;
- constraints;
- preparation;
- anti-patterns.

Действия:

- `Использовать`;
- `Не использовать`;
- `Подробнее`;
- добавление нового `APPROVED outcome`.

---

## 12. Authentication и workspace isolation

### Login

Password login использует Argon2id.

Unknown-account path всё равно выполняет credential lookup + Argon2 verification against a dummy hash для уменьшения timing enumeration signal.

### Sessions

- opaque random session token;
- в БД хранится hash, а не raw token;
- browser получает HttpOnly cookie;
- login response содержит CSRF token;
- mutations требуют CSRF.

### Login throttling

Persistent distributed throttling хранится в PostgreSQL.

Raw email/IP не сохраняются как throttle keys — используются keyed HMAC identifiers.

### Workspace

Каждый request разрешается в конкретный workspace membership.

Tenant-sensitive repositories фильтруют по `workspace_id`; URL/id сам по себе не является authorization boundary.

---

## 13. PostgreSQL migrations

Миграции append-only: уже применённый migration file не переписывается.

Текущий набор включает:

- foundation/course/content schema;
- planning safety;
- identity/security;
- login throttle;
- AI proposal queue;
- proposal application;
- proposal dismissal/history;
- AI invocation proposal trace;
- methodology feedback.
- course plan revisions, per-lesson progression, private source bindings и local development blob persistence.

Критические изменения должны добавляться новой migration.

---

## 14. API — основные endpoint groups

### Auth

```text
POST /api/v1/auth/login
GET  /api/v1/me
POST /api/v1/auth/logout
```

### Course / Lesson

```text
GET /api/v1/courses
GET /api/v1/courses/:courseId
GET /api/v1/courses/:courseId/lessons
GET /api/v1/lessons/:lessonId
GET /api/v1/lessons/:lessonId/invalidations
```

### Course planning / sources

```text
GET  /api/v1/courses/:courseId/planning-context
PUT  /api/v1/courses/:courseId/plan
POST /api/v1/courses/:courseId/plan/approve
POST /api/v1/courses/:courseId/sources
POST /api/v1/courses/:courseId/sources/:bindingId/approve
```

План и источник не становятся AI-контекстом автоматически: черновик плана и загруженный документ требуют отдельных явных действий педагога. PDF/TXT/Markdown разбираются на bounded fragments с SHA-256 provenance. Оригиналы в локальной разработке сохраняются приватно в PostgreSQL; production target переносит binary payload в private Object Storage без изменения stable `source_document_id`.

### Governed core decisions

```text
PATCH /api/v1/lessons/:lessonId/decisions/:semanticKey
POST  /api/v1/lessons/:lessonId/decisions/:semanticKey/approve
```

### AI proposals

```text
POST /api/v1/lessons/:lessonId/ai-proposals
GET  /api/v1/lessons/:lessonId/ai-proposals
GET  /api/v1/lessons/:lessonId/ai-proposals/:proposalId
POST /api/v1/lessons/:lessonId/ai-proposals/:proposalId/apply
POST /api/v1/lessons/:lessonId/ai-proposals/:proposalId/dismiss
```

### Methodology

```text
GET  /api/v1/lessons/:lessonId/methodology/recommendations
POST /api/v1/lessons/:lessonId/outcomes
POST /api/v1/lessons/:lessonId/methodology/recommendations/:recommendationId/use
POST /api/v1/lessons/:lessonId/methodology/recommendations/:recommendationId/reject
```

---

## 15. Tests и quality gates

CI проверяет три главных направления.

### Verify

```text
pnpm typecheck
pnpm build
pnpm test
pnpm db:smoke
```

Критические integration/E2E tests проверяют:

- login;
- CSRF;
- workspace isolation;
- governed teacher decision;
- AI proposal queue;
- worker processing;
- READY result;
- explicit Apply;
- persistence after reload;
- AI traceability;
- Methodical Constructor approved-only behavior;
- explicit methodology Apply;
- methodology reject persistence;
- downstream invalidation.

### Containers

CI строит API и worker production images и утверждает non-root runtime.

### Terraform

```text
terraform fmt -check -recursive
terraform init -backend=false
terraform validate
```

Красный CI не обходится удалением проверки: исправляется причина.

---

## 16. Yandex Cloud target architecture

Текущий Terraform foundation проектирует:

```text
Internet
  │
Cloud CDN / Object Storage web
  │
API Gateway
  │
Serverless Container API (HTTP)
  │
Managed PostgreSQL

Timer trigger
  │
Serverless Container Worker (task / once)
  │
PostgreSQL durable queue
  │
AI provider
```

Также предусмотрены:

- VPC connectivity;
- private PostgreSQL;
- private content/artifact Object Storage;
- отдельные API/worker image repositories;
- least-privilege runtime identities;
- Lockbox environment injection;
- deploy identity без committed static key;
- static web hosting/CDN foundation;
- immutable image digest support;
- deployment/rollback runbook.

**Важно:** наличие Terraform-кода не означает, что облачные ресурсы уже созданы. В репозитории нет Yandex Cloud credentials, и реальный `terraform apply` не выполнялся в рамках разработки.

---

## 17. RP / UMK content architecture

Платформа поддерживает два совместимых контура: централизованные versioned Content Packs и приватные документы конкретного курса, загруженные педагогом с явным rights basis и разрешением на использование AI.

Каждый course должен быть связан с:

- curriculum/RP version;
- content/UMK version;
- academic year;
- provenance.

RP задаёт нормативное ядро:

- структуру курса;
- разделы;
- часы;
- темы;
- обязательное содержание;
- результаты;
- контрольные точки.

UMK задаёт конкретное предметное содержание.

Целевая semantic UMK модель:

```text
Учебник
└── Глава
    └── Параграф
        ├── подразделы
        ├── основной текст
        ├── понятия
        ├── даты
        ├── персоналии
        ├── причинно-следственные связи
        ├── источники
        ├── карты
        ├── иллюстрации
        ├── таблицы
        └── вопросы/задания
```

Каждый fragment должен иметь provenance: edition/version, chapter/paragraph/page, element type, source document.

Контент в UI должен различаться как:

- `ОБЯЗАТЕЛЬНО ПО РП`;
- `СОДЕРЖИТСЯ В УМК`;
- `РЕКОМЕНДУЕТ AI ДОПОЛНИТЕЛЬНО`.

Режимы содержания:

1. Строго по УМК.
2. УМК + проверенные дополнительные материалы.
3. Расширенный.

Центральное хранение коммерческого УМК возможно только при наличии соответствующих прав/лицензии. Несанкционированный scraping не является допустимой частью архитектуры.

---

## 18. Source provenance

Типы источников должны различаться явно:

- `PRIMARY_SOURCE`;
- `SECONDARY_SOURCE`;
- `TEXTBOOK`;
- `REFERENCE`;
- `AI_RECONSTRUCTION`.

AI reconstruction никогда не маркируется как реальный исторический документ.

Обязательная пользовательская маркировка для реконструкции:

> ⚠ Учебная реконструкция. Текст создан AI и не является историческим документом.

---

## 19. Design freedom

Два независимых измерения:

- content freedom: strict UMK ↔ expanded;
- methodical freedom: classic ↔ experimental.

Product modes:

- `REGULATED`;
- `BALANCED`;
- `CREATIVE`.

Creative mode не отменяет:

- mandatory RP coverage;
- source provenance;
- factual validation;
- time feasibility;
- explicit teacher approval.

---

## 20. Текущий benchmark

Основной regression benchmark:

**Курс:** Всеобщая история. История Нового времени. XIX — начало XX в.  
**Раздел:** Начало индустриальной эпохи  
**Урок:** Экономика делает решающий рывок

Критический teacher-authority вопрос:

> «Почему в XIX в. промышленная революция достигла огромных успехов?»

Система должна гарантировать:

1. если педагог утвердил эту формулировку, worker получает именно её в approved context;
2. AI может предложить улучшенный вариант отдельно;
3. до explicit Apply исходное решение не меняется;
4. после Apply новая формулировка становится `TEACHER + APPROVED`, а AI provenance сохраняется;
5. зависимые блоки корректно invalidated.

Для Methodical Constructor causal outcome должен объяснимо приоритизировать исследовательский метод проверки гипотез, но окончательный выбор остаётся за педагогом.

---

## 21. Ближайший roadmap

### Next: развитие Content / RP / UMK

1. OCR для сканированных PDF и DOCX ingestion;
2. semantic retrieval/reranking вместо bounded sequential fragment selection;
3. автоматическое предложение структуры курса из РП как отдельный AI proposal с explicit Apply;
4. матрица покрытия результатов и требований по всем урокам;
5. production Object Storage adapter для оригиналов документов.

### Затем

6. `05 Сценарий`: этапы урока с constraint/time engine;
7. `06 Материалы`: sources/tasks/assets;
8. `07 Экспертиза`: consistency/evidence/time checks;
9. `08 Карта урока`: deterministic assembly из approved components;
10. print/export.

### Позже

- semantic RAG at scale;
- content importer runtime;
- organization-level administration;
- additional subjects/content packs.

---

## 22. Чего не делать

- не превращать приложение в one-click генератор;
- не позволять AI молча изменять `APPROVED`;
- не использовать полный чат как authoritative generation context;
- не смешивать method, technique и form;
- не считать название УМК фактом retrieval;
- не выдавать AI reconstruction за historical source;
- не делать tenant query без workspace scope;
- не обходить CSRF для mutations;
- не менять уже применённые migrations;
- не выполнять silent provider/model fallback;
- не строить микросервисы без измеримой причины;
- не утверждать, что Yandex Cloud provisioned, пока `terraform apply` реально не выполнен оператором.

---

## 23. Документы, которые обязан читать coding agent

Перед изменением кода агент читает в порядке:

1. `RULS.md`;
2. `TECHNICAL_DOCUMENTATION.md`;
3. `docs/WORK_PLAN_24H.md` или более свежий checkpoint;
4. релевантные `docs/adr/*`;
5. текущий код, migrations и tests затрагиваемого слоя.

Архитектурные документы не заменяют фактическое состояние кода: перед реализацией необходимо проверить `main`, активные PR и CI.
