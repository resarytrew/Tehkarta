# ПОЛНАЯ ТЕХНИЧЕСКАЯ ДОКУМЕНТАЦИЯ TEHKARTA

**Версия документа:** 1.0  
**Версия платформы:** 0.1.0 foundation  
**Последнее обновление:** 23 августа 2026 г.  
**Статус:** активная разработка · первый production-oriented vertical slice  
**Целевая инфраструктура:** Yandex Cloud

> Tehkarta — AI-среда совместного педагогического проектирования образовательного процесса: **курс → раздел → урок → этап → задания и материалы**.
>
> Главный системный принцип: **AI предлагает. Педагог решает. Платформа гарантирует, что утверждённое решение педагога не будет молча переписано дальше по цепочке.**

---

## СОДЕРЖАНИЕ

1. [Назначение платформы](#1-назначение-платформы)
2. [Архитектура системы](#2-архитектура-системы)
3. [Технологический стек](#3-технологический-стек)
4. [Структура репозитория](#4-структура-репозитория)
5. [Domain Model](#5-domain-model)
6. [Teacher Decision Governance](#6-teacher-decision-governance)
7. [Frontend](#7-frontend)
8. [Backend API](#8-backend-api)
9. [AI Proposal Engine](#9-ai-proposal-engine)
10. [База данных](#10-база-данных)
11. [Аутентификация, авторизация и tenancy](#11-аутентификация-авторизация-и-tenancy)
12. [Dependency Invalidation](#12-dependency-invalidation)
13. [API Reference](#13-api-reference)
14. [Конфигурация](#14-конфигурация)
15. [Локальная разработка](#15-локальная-разработка)
16. [Тестирование и CI](#16-тестирование-и-ci)
17. [Docker и Yandex Cloud](#17-docker-и-yandex-cloud)
18. [УМК, RAG и provenance](#18-умк-rag-и-provenance)
19. [Наблюдаемость, audit и AI traceability](#19-наблюдаемость-audit-и-ai-traceability)
20. [Миграции и версионирование](#20-миграции-и-версионирование)
21. [Текущий статус реализации](#21-текущий-статус-реализации)
22. [Roadmap](#22-roadmap)
23. [Troubleshooting](#23-troubleshooting)
24. [Инварианты, которые нельзя нарушать](#24-инварианты-которые-нельзя-нарушать)

---

# 1. НАЗНАЧЕНИЕ ПЛАТФОРМЫ

Tehkarta создаётся не как «генератор технологических карт в один клик», а как **teacher-first среда педагогического проектирования**.

Педагог задаёт образовательное намерение, принимает ключевые решения и утверждает результат. AI выполняет роль методиста, предметного помощника, аналитика и генератора вариантов, но не становится авторитетным источником состояния урока.

## 1.1 Иерархия продукта

```text
КУРС
└── РАЗДЕЛЫ
    └── УРОКИ
        └── ЭТАПЫ УРОКА
            └── ЗАДАНИЯ И МАТЕРИАЛЫ
```

Каждый нижний уровень должен получать контекст верхнего уровня.

Урок не проектируется изолированно, если он является частью курса. В будущем generation context должен включать:

- цели курса и раздела;
- обязательное содержание;
- уже изученные понятия;
- предыдущий и следующий урок;
- progression результатов и навыков;
- выбранный УМК;
- утверждённые решения педагога.

## 1.2 Источники истины

Приоритет данных:

```text
1. Прямое решение педагога
2. Утверждённая логика курса / раздела
3. Обязательная рабочая программа / curriculum
4. Подключённый УМК и доказательства из источников
5. Утверждённая педагогическая технология / методы / формы
6. AI-рекомендация
```

AI находится внизу иерархии и не имеет права молча повышать собственную рекомендацию до статуса решения педагога.

## 1.3 Основной педагогический workflow

Целевой workflow урока:

```text
Педагогический профиль
→ Параметры урока
→ Цели и результаты
→ Методический конструктор
→ Содержание УМК
→ Сценарий урока
→ Материалы
→ Экспертиза
→ Итоговая технологическая карта
```

Итоговая карта должна **собираться из утверждённых блоков**, а не генерироваться заново поверх них.

---

# 2. АРХИТЕКТУРА СИСТЕМЫ

## 2.1 Архитектурный стиль

Tehkarta использует **modular monolith first** с hexagonal boundaries.

Логические bounded contexts разделены, но на раннем этапе система не дробится на микросервисы без реальной причины для независимого масштабирования или failure isolation.

Базовые процессы:

```text
┌──────────────────────────────────────────────────────────────┐
│                         WEB                                  │
│ React 19 + TypeScript + Vite                                │
└──────────────────────────────┬───────────────────────────────┘
                               │ HTTPS / JSON
                               ▼
┌──────────────────────────────────────────────────────────────┐
│                         API                                  │
│ Fastify 5 + application use cases                           │
│ auth · courses · lessons · governance · AI proposal queue   │
└───────────────┬─────────────────────┬────────────────────────┘
                │                     │
                ▼                     ▼
       ┌────────────────┐     ┌─────────────────────┐
       │ PostgreSQL     │     │ async_jobs          │
       │ source of truth│     │ durable queue state │
       └────────────────┘     └──────────┬──────────┘
                                        │
                                        ▼
                             ┌─────────────────────┐
                             │ WORKER              │
                             │ AI / OCR / export   │
                             └──────────┬──────────┘
                                        │
                                        ▼
                             ┌─────────────────────┐
                             │ AI Providers        │
                             │ Yandex / OpenRouter │
                             └─────────────────────┘
```

На `main` уже реализована durable AI proposal queue. Worker execution layer развивается отдельным вертикальным срезом и не должен считаться production-complete до прохождения CI и merge.

## 2.2 Направление зависимостей

```text
packages/domain
      ↑
packages/application ← packages/ports
      ↑                     ↑
packages/database     infrastructure adapters
packages/identity
packages/ai
      ↑
apps/api

apps/web → HTTP API + shared domain types where appropriate
```

Ключевое правило: **domain/application не должны зависеть от SDK Yandex Cloud, PostgreSQL client, OpenRouter или конкретной AI-модели**.

## 2.3 PostgreSQL как authoritative store

Постоянное бизнес-состояние хранится в PostgreSQL.

Object Storage, queue и AI-provider не являются источником истины. Сообщение в очереди — способ доставки работы, а не authoritative business state.

---

# 3. ТЕХНОЛОГИЧЕСКИЙ СТЕК

| Слой | Технология | Текущая версия / политика | Назначение |
|---|---|---|---|
| Runtime | Node.js | `>=22` | серверный runtime |
| Package manager | pnpm | `9.15.0` | monorepo/workspaces |
| Language | TypeScript | `^5.6.3` | строгая типизация |
| Frontend | React | `^19.1.1` | UI педагога |
| Frontend build | Vite | `^7.1.3` | dev/build |
| Backend | Fastify | `^5.2.1` | HTTP API |
| Security HTTP | Helmet / CORS / Cookie | Fastify plugins | headers, CORS, cookies |
| Database | PostgreSQL | 16 в CI | authoritative state |
| DB client | `pg` | `^8.13.1` | PostgreSQL adapter |
| Password hashing | Argon2id | `@node-rs/argon2 2.1.0` | credentials |
| IaC | Terraform | CI validate | Yandex Cloud infrastructure |
| Containers | Docker | production API image | Serverless Containers target |
| AI | provider-neutral `AIProvider` | policy-based routing | генерация и embeddings |
| Target cloud | Yandex Cloud | architecture target | web, API, DB, files, secrets, queues |

## 3.1 Целевые Yandex Cloud компоненты

Архитектурный target:

- Object Storage + CDN — web/static и крупные файлы;
- API Gateway — публичный API perimeter;
- Serverless Containers — API и worker;
- Managed PostgreSQL — бизнес-данные и в дальнейшем `pgvector`;
- Message Queue — transport для долгих jobs;
- Lockbox — секреты;
- Object Storage — УМК, exports, source documents;
- Monium / OpenTelemetry — наблюдаемость;
- Terraform — Infrastructure as Code.

Точный набор реально созданных cloud resources всегда проверяется по `infra/terraform`, а не по этому target-описанию.

---

# 4. СТРУКТУРА РЕПОЗИТОРИЯ

```text
Tehkarta/
├── apps/
│   ├── web/                  # React teacher workspace
│   └── api/                  # Fastify HTTP API
│
├── packages/
│   ├── domain/               # Core pedagogical/domain model + invariants
│   ├── application/          # Use cases, repository contracts, governance
│   ├── ports/                # Infrastructure-neutral ports/contracts
│   ├── database/             # PostgreSQL repositories + migrations + smoke tests
│   ├── identity/             # sessions, credentials, Argon2id, authorization
│   └── ai/                   # AI abstractions/routing contracts
│
├── docs/
│   ├── architecture/         # Architecture descriptions
│   └── adr/                  # Architecture Decision Records
│
├── infra/
│   └── terraform/            # Yandex Cloud IaC
│
├── .github/workflows/        # CI
├── compose.dev.yml           # local PostgreSQL environment
├── .env.example              # documented environment variables
├── package.json              # monorepo scripts
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── TECHNICAL_DOCUMENTATION.md
└── RULS.md                   # mandatory instructions for AI coding agents
```

## 4.1 Пакеты

### `@tehkarta/domain`

Содержит:

- `Course`, `Section`, `Lesson`;
- `GovernedField<T>`;
- provenance/status metadata;
- `DesignFreedom`;
- `SourceRef`, `CurriculumRequirement`, `UmkEvidence`;
- helpers для approved state;
- dependency metadata/seed fixtures.

### `@tehkarta/application`

Содержит application use cases и repository interfaces.

Примеры:

- редактирование core lesson decision;
- approve decision;
- AI proposal request;
- invalidation logic;
- optimistic concurrency validation.

### `@tehkarta/database`

PostgreSQL adapters:

- course repository;
- lesson repository;
- lesson invalidation repository;
- identity/session repositories;
- login throttle repository;
- AI proposal repository;
- migrations;
- integration smoke tests.

### `@tehkarta/identity`

- password login;
- Argon2id;
- session token lifecycle;
- CSRF secret lifecycle;
- workspace authorization policy;
- login throttling.

### `@tehkarta/ai`

Vendor-neutral AI contracts. Конкретный provider не должен проникать в domain/application.

---

# 5. DOMAIN MODEL

## 5.1 GovernedField

Каждое важное педагогическое решение хранит не только значение, но и происхождение и ревизию.

```ts
type ApprovalStatus = 'PROPOSED' | 'EDITED' | 'APPROVED';
type ValueSource = 'AI' | 'TEACHER' | 'CURRICULUM' | 'UMK' | 'SYSTEM';

interface GovernedField<T> {
  fieldId: string;
  value: T;
  meta: {
    revision: number;
    source: ValueSource;
    status: ApprovalStatus;
    updatedAt: string;
    updatedBy?: string;
    approvedAt?: string;
    approvedBy?: string;
  };
}
```

Это не UI-метаданные. Это часть бизнес-модели.

## 5.2 Course

```text
Course
├── subject
├── grade
├── academicYear
├── curriculumPackId + version
├── contentPackId + version
└── sections[]
```

## 5.3 Section

```text
Section
├── title
├── plannedHours
├── lessonIds[]
└── requirementIds[]
```

В будущем Section должен хранить trajectory/progression, а не быть простой папкой.

## 5.4 Lesson

Текущая модель Lesson содержит:

- идентификаторы course/section;
- order/title/duration;
- педагогический профиль;
- design freedom;
- goal;
- problemQuestion;
- bigIdea;
- outcomes;
- methods;
- techniques;
- forms;
- content items.

## 5.5 Design Freedom

```ts
type DesignMode = 'REGULATED' | 'BALANCED' | 'CREATIVE';
type ContentFreedom = 'TEXTBOOK_STRICT' | 'TEXTBOOK_PLUS' | 'EXPANDED';
type MethodFreedom = 'CLASSIC' | 'FLEXIBLE' | 'EXPERIMENTAL';
```

Эти настройки определяют свободу проектирования, но **не отменяют curriculum requirements, provenance и teacher approval**.

---

# 6. TEACHER DECISION GOVERNANCE

Это центральный архитектурный механизм Tehkarta.

## 6.1 State machine

```text
AI_PROPOSED / SOURCE_PROPOSED
          ↓
       PROPOSED
          ↓ педагог редактирует
        EDITED
          ↓ «Применить»
       APPROVED
```

Только `APPROVED` является authoritative teacher-controlled context для последующих этапов.

## 6.2 Применить != просто сохранить textarea

UI поддерживает два разных действия:

- **Сохранить черновик** — `EDITED`, downstream использовать нельзя;
- **✓ Применить** — `APPROVED`, значение становится authoritative.

## 6.3 Защита на нескольких слоях

Защита от silent overwrite должна быть минимум в трёх местах:

1. domain/application invariant;
2. use-case/API workflow;
3. PostgreSQL trigger.

В миграции `0002_planning_safety.sql` есть DB guard: AI-source update не может перезаписать уже `APPROVED` lesson decision.

## 6.4 Критический regression fixture

Один из обязательных regression cases:

```text
Педагог утверждает:
«Почему в XIX в. промышленная революция достигла огромных успехов?»
```

После любых AI operations этот текст не должен исчезнуть или быть заменён без отдельного явного действия педагога.

---

# 7. FRONTEND

**Путь:** `apps/web`

## 7.1 Стек

- React 19;
- TypeScript;
- Vite;
- HTTP API client;
- серверная session cookie;
- workspace context;
- CSRF token для mutations.

## 7.2 Основной teacher workspace

Текущий UI реализует:

- выбор курса;
- список разделов/уроков;
- lesson workspace;
- governed field cards;
- статусы `PROPOSED / EDITED / APPROVED`;
- кнопки AI-помощника;
- dependency invalidation panel;
- отображение approved context.

## 7.3 `GovernedFieldCard`

Основные UX-инварианты:

```text
✨ Предложено AI
✎ Изменено педагогом
✓ Утверждено педагогом
```

Для ключевых полей доступны действия:

- `✨ Предложить варианты`;
- `↻ Перегенерировать`;
- `✎ Улучшить`;
- `Сохранить черновик`;
- `✓ Применить`.

AI-action не должен автоматически менять textarea authoritative field.

## 7.4 Чувствительные данные

Frontend никогда не хранит:

- password hash;
- session raw token в localStorage;
- AI provider keys;
- database credentials;
- Lockbox secrets.

Session token живёт в `HttpOnly` cookie. CSRF token допускается в session-scoped storage как client-side anti-CSRF credential.

---

# 8. BACKEND API

**Путь:** `apps/api`

## 8.1 Fastify runtime

Базовые security plugins:

- `@fastify/helmet`;
- `@fastify/cors`;
- `@fastify/cookie`.

HTTP body limit: 1 MiB для обычного API.

## 8.2 Request context

Сервер формирует request/workspace context и не доверяет одному только client-supplied object ID.

Каждый protected endpoint должен:

1. разрешить session;
2. определить workspace membership;
3. проверить permission;
4. выполнять repository query с `workspace_id` boundary.

## 8.3 Ошибки application layer

Основные коды:

- `NOT_FOUND` → 404;
- `FORBIDDEN` → 403;
- `CONFLICT` → 409;
- `STALE_VERSION` → 409;
- `DEPENDENCY_STALE` → 409;
- `VALIDATION_FAILED` → 422;
- `EXTERNAL_SERVICE_FAILED` → 502.

Клиент не должен принимать решения по произвольному тексту ошибки, если доступен stable code.

---

# 9. AI PROPOSAL ENGINE

## 9.1 Главный принцип

AI proposal — **отдельный объект**, а не update lesson decision.

```text
lesson_decisions            lesson_ai_proposals
(authoritative)             (suggestions)
        │                          │
        │ teacher owns            │ AI may populate
        └──────────────X───────────┘
              no silent overwrite
```

## 9.2 Поддерживаемые действия

```ts
'VARIANTS' | 'REGENERATE' | 'IMPROVE'
```

Семантика:

- `VARIANTS` — несколько педагогически различающихся вариантов;
- `REGENERATE` — новая формулировка в рамках approved context;
- `IMPROVE` — сохранение смысла педагога с методическим улучшением формулировки.

## 9.3 Durable request boundary

При AI request создаются:

- запись `lesson_ai_proposals`;
- запись `async_jobs`;
- idempotency key;
- snapshot target lesson version;
- base decision ID/revision;
- teacher instruction при наличии.

Постановка AI request **не изменяет** `lesson_decisions`.

## 9.4 Idempotency

Повтор одного и того же запроса с тем же request key возвращает существующую операцию.

Повторное использование ключа для другого AI request должно приводить к conflict, а не к неявному переиспользованию.

## 9.5 Worker execution

Worker layer должен:

1. claim durable job;
2. проверить, что lesson/field revision не изменились;
3. если изменились — `STALE`, без применения AI;
4. собрать только approved context;
5. вызвать model provider;
6. провалидировать structured output;
7. сохранить candidates в proposal;
8. не изменять authoritative teacher decision.

На момент версии этого документа queue boundary находится в `main`; worker execution до его merge следует считать **разрабатываемым компонентом**, а не готовой runtime-функцией.

---

# 10. БАЗА ДАННЫХ

## 10.1 PostgreSQL

PostgreSQL — authoritative persistent store.

## 10.2 Миграции

Текущий набор на `main`:

| Migration | Назначение |
|---|---|
| `0001_foundation.sql` | foundation schema: identity, curriculum/content, course/lesson, jobs, audit, AI traceability |
| `0002_planning_safety.sql` | archive-safe ordering + DB guard teacher authority |
| `0003_identity_security.sql` | identity security hardening |
| `0004_auth_login_throttle.sql` | login throttling |
| `0005_ai_proposals.sql` | isolated AI proposal persistence |

## 10.3 Важные группы таблиц

### Identity / tenancy

- users;
- workspaces;
- workspace_memberships;
- password credentials;
- sessions;
- login throttle data.

### Curriculum / content

- source_documents;
- curriculum_packs;
- curriculum_courses;
- curriculum_sections;
- curriculum_lessons;
- content_packs.

### Teacher planning

- courses;
- course_sections;
- lessons;
- lesson_decisions;
- lesson_decision_revisions;
- lesson invalidations.

### Async / AI / audit

- async_jobs;
- lesson_ai_proposals;
- ai_invocations;
- outbox_events;
- audit_events.

## 10.4 JSONB

JSONB допустим для payload/result/provenance envelopes, но не должен превращать весь lesson aggregate в один гигантский непрозрачный JSON document.

Причины:

- нужна частичная регенерация;
- version history;
- dependency invalidation;
- audit;
- отдельные locks/approvals;
- аналитика.

---

# 11. АУТЕНТИФИКАЦИЯ, АВТОРИЗАЦИЯ И TENANCY

## 11.1 Password login

Пароли хэшируются Argon2id.

Unknown-account login выполняет real Argon2 verification against dummy hash, уменьшая timing difference между существующим и несуществующим email.

## 11.2 Session model

- raw session token передаётся только клиенту;
- в БД хранится hash token;
- CSRF secret также хранится не в raw-виде;
- logout revokes server-side session.

## 11.3 Cookies

Session cookie:

- `HttpOnly`;
- `Secure` в production;
- `SameSite=Lax`;
- scoped path `/`.

## 11.4 CSRF

State-changing endpoints требуют CSRF token.

Отсутствие CSRF check на authenticated mutation считается security regression.

## 11.5 Workspace isolation

Каждый business record принадлежит workspace.

Repository query вида:

```sql
WHERE id = $1
```

для tenant-owned данных недостаточен.

Нужно:

```sql
WHERE id = $1 AND workspace_id = $2
```

или эквивалентная server-side tenant policy.

---

# 12. DEPENDENCY INVALIDATION

Изменение upstream педагогического решения может сделать downstream artifacts устаревшими.

Пример:

```text
Проблемный вопрос изменён
↓
Большая идея     STALE
Содержание       STALE
Сценарий         STALE
Задания          STALE
Итоговый вывод   STALE
```

Система должна **помечать**, а не молча перегенерировать.

Педагог затем принимает решение:

- пересчитать зависимые элементы;
- оставить текущие;
- вручную отредактировать;
- позже разрешить конкретную AI-регенерацию.

Dependency graph должен быть explicit domain/application concern.

---

# 13. API REFERENCE

Текущие public routes используют `/api/v1`.

## 13.1 Platform / health

```http
GET /health
GET /api/v1/platform
```

## 13.2 Auth

```http
POST /api/v1/auth/login
GET  /api/v1/me
POST /api/v1/auth/logout
```

## 13.3 Courses

```http
GET /api/v1/courses
GET /api/v1/courses/:courseId
GET /api/v1/courses/:courseId/lessons
```

## 13.4 Lessons

```http
GET /api/v1/lessons/:lessonId
GET /api/v1/lessons/:lessonId/invalidations
```

## 13.5 Governed decisions

```http
PATCH /api/v1/lessons/:lessonId/decisions/:semanticKey
POST  /api/v1/lessons/:lessonId/decisions/:semanticKey/approve
```

На текущем vertical slice `semanticKey`:

```text
goal
problemQuestion
bigIdea
```

Mutation использует optimistic concurrency:

```json
{
  "value": "...",
  "expectedLessonVersion": 3,
  "expectedFieldRevision": 2
}
```

## 13.6 AI proposals

```http
GET  /api/v1/lessons/:lessonId/ai-proposals
POST /api/v1/lessons/:lessonId/ai-proposals
```

Пример request:

```json
{
  "semanticKey": "problemQuestion",
  "action": "VARIANTS",
  "expectedLessonVersion": 3,
  "candidateCount": 3,
  "teacherInstruction": "Сохрани причинно-следственный характер вопроса",
  "requestKey": "client-generated-idempotency-key"
}
```

Успешная постановка — HTTP `202`.

---

# 14. КОНФИГУРАЦИЯ

Источник примера: `.env.example`.

## 14.1 Database

```dotenv
DATABASE_URL=postgres://tehkarta:tehkarta@localhost:5432/tehkarta
DB_POOL_MAX=10
DB_STATEMENT_TIMEOUT_MS=15000
DB_IDLE_TIMEOUT_MS=30000
DB_APPLICATION_NAME=tehkarta-api
DB_SSL=disable
DB_SSL_CA_PATH=
```

`DB_SSL`:

- `disable`;
- `require`;
- `verify-full`.

Для production Yandex Managed PostgreSQL предпочтителен CA verification там, где используется TLS connection path.

## 14.2 HTTP / auth

```dotenv
CORS_ALLOWED_ORIGINS=http://localhost:5173
SESSION_TTL_SECONDS=43200
AUTH_IP_HASH_KEY=
TRUST_PROXY=false
```

`AUTH_IP_HASH_KEY` обязателен в production и должен приходить из secret manager/Lockbox.

## 14.3 AI

```dotenv
OPENROUTER_API_KEY=
YANDEX_AI_API_KEY=
```

Реальные ключи запрещено коммитить.

---

# 15. ЛОКАЛЬНАЯ РАЗРАБОТКА

## 15.1 Требования

- Node.js 22+;
- pnpm 9.15.0;
- Docker;
- PostgreSQL 16-compatible local environment.

## 15.2 Install

```bash
pnpm install
```

## 15.3 PostgreSQL

```bash
docker compose -f compose.dev.yml up -d
```

## 15.4 Миграции

```bash
pnpm db:migrate
```

## 15.5 Bootstrap development fixture

```bash
pnpm db:bootstrap-dev
```

## 15.6 Запуск web + API

```bash
pnpm dev
```

## 15.7 Полная проверка

```bash
pnpm typecheck
pnpm build
pnpm test
pnpm db:smoke
```

---

# 16. ТЕСТИРОВАНИЕ И CI

## 16.1 Обязательные классы проверок

CI должен защищать не только compile correctness, но и product invariants.

Текущая pipeline включает:

- install;
- TypeScript typecheck;
- build;
- package tests;
- PostgreSQL smoke;
- Docker image build;
- non-root runtime assertion;
- Terraform format/init/validate.

## 16.2 Database smoke

Smoke tests проверяют, среди прочего:

- migrations;
- DB teacher-authority trigger;
- governed edit/apply workflow;
- dependency invalidation;
- tenant isolation;
- hashed session token;
- hashed CSRF secret;
- workspace membership enforcement;
- session revocation;
- AI proposal isolation;
- AI proposal idempotency.

## 16.3 Benchmark-driven AI testing

При подключении model execution должны существовать fixed pedagogical benchmark fixtures.

Изменение prompt/model routing не принимается только потому, что «один ответ выглядит лучше».

Метрики:

- preservation teacher decision;
- методическая fidelity;
- curriculum coverage;
- UMK fidelity;
- time feasibility;
- factual/source integrity;
- duplication;
- structured-output validity;
- latency;
- cost.

---

# 17. DOCKER И YANDEX CLOUD

## 17.1 Docker

Production API image должен:

- собираться reproducibly;
- запускаться non-root;
- не содержать `.env` secrets;
- корректно обрабатывать SIGTERM;
- закрывать Fastify и PostgreSQL pool при graceful shutdown.

## 17.2 Target deployment

```text
Internet
  ↓
API Gateway
  ↓
Serverless Container: API
  ↓
Managed PostgreSQL

Long-running operations
  ↓
Queue / durable job state
  ↓
Serverless Container: Worker
```

Web:

```text
Object Storage → CDN
```

Secrets:

```text
Lockbox → runtime bindings/env
```

## 17.3 Vendor boundary

Yandex Cloud — deployment target, но business logic не должна импортировать Yandex SDK в domain/application.

---

# 18. УМК, RAG И PROVENANCE

Этот раздел описывает target architecture. Полный RAG pipeline ещё не является завершённой функциональностью `main`.

## 18.1 Принцип

Выбор `УМК: ...` как строки не означает, что AI знает конкретный учебник.

Нужен реальный source pipeline:

```text
PDF / licensed corpus
→ text/OCR extraction
→ structure parsing
→ chapter/paragraph/page metadata
→ semantic chunks
→ embeddings/index
→ retrieval
→ generation with exact evidence refs
```

## 18.2 Source model

Каждый relevant fragment должен иметь metadata:

- source document ID;
- source version/edition;
- source type;
- chapter/paragraph;
- page range;
- checksum/fragment hash;
- rights basis.

## 18.3 Content modes

Целевая семантика:

### `TEXTBOOK_STRICT`
Основное содержание ограничено выбранным УМК + обязательным curriculum.

### `TEXTBOOK_PLUS`
УМК — основа, проверенные дополнительные материалы выделены отдельно.

### `EXPANDED`
УМК остаётся backbone, но допускается существенное расширение.

## 18.4 Copyright / rights

Нельзя проектировать ingestion как обход лицензирования.

Допустимые источники:

- материал, загруженный педагогом законно;
- licensed publisher/library corpus;
- rights-holder agreement;
- open educational resources.

---

# 19. НАБЛЮДАЕМОСТЬ, AUDIT И AI TRACEABILITY

Foundation schema уже предусматривает:

- `audit_events`;
- `ai_invocations`;
- `outbox_events`;
- async job status/error metadata.

## 19.1 Для AI вызова должны быть известны

- task type;
- provider;
- model;
- prompt version;
- routing policy version;
- input hash;
- status;
- latency;
- token usage при наличии;
- cost при наличии;
- error class.

## 19.2 Privacy

Full prompt/response payload не должен логироваться автоматически как prerequisite для диагностики.

PII и чувствительные материалы должны минимизироваться в AI prompts и logs.

---

# 20. МИГРАЦИИ И ВЕРСИОНИРОВАНИЕ

## 20.1 Никогда не редактировать уже применённую production migration

Новая схема = новая migration.

## 20.2 Expand-contract

Для production-safe changes:

```text
1. Expand — добавить новые nullable/backward-compatible структуры
2. Deploy code — начать писать/читать новый формат
3. Backfill — при необходимости
4. Contract — отдельной migration удалить legacy после безопасного окна
```

## 20.3 Что должно версионироваться

- curriculum packs;
- content/UMK packs;
- prompts;
- model routing policies;
- methodology packs;
- validation rules;
- lesson revisions;
- exports.

Исторический урок должен быть объясним и по возможности воспроизводим после обновления платформы.

---

# 21. ТЕКУЩИЙ СТАТУС РЕАЛИЗАЦИИ

## Реализовано на `main`

- pnpm TypeScript monorepo;
- React teacher workspace;
- Fastify API;
- PostgreSQL schema/migrations;
- password/session identity foundation;
- workspace tenancy;
- Argon2id;
- CSRF protection;
- login throttling;
- course → section → lesson read model;
- governed fields для `goal`, `problemQuestion`, `bigIdea`;
- `EDITED → APPROVED` flow;
- optimistic lesson/field revisions;
- dependency invalidations;
- DB guard against AI overwrite of approved decisions;
- AI proposal request objects;
- isolated `lesson_ai_proposals`;
- durable `async_jobs` entry при AI request;
- idempotent AI proposal queue;
- frontend buttons AI proposal actions;
- CI build/typecheck/smoke/container/Terraform checks.

## В активной разработке

- worker execution core;
- provider routing adapters;
- structured AI candidate generation;
- stale request detection during worker execution;
- proposal `READY` lifecycle.

## Ещё не считать готовым

- применение READY AI candidate через явное teacher approval;
- полноценный methodology engine;
- Course Memory / Learning Graph;
- curriculum result progression matrix;
- complete UMK RAG ingestion;
- OCR/import pipeline;
- production Yandex deploy of all target components;
- lesson stage/material/export engines;
- semantic validators;
- browser/e2e test suite.

---

# 22. ROADMAP

Порядок развития продукта должен оставаться педагогически обусловленным.

```text
1. Teacher Decision Locking
2. Dependency / Invalidation Engine
3. Course / Section / Lesson context
4. AI Proposal lifecycle
5. Worker + model routing
6. Explicit Apply AI Candidate
7. Course Memory / Learning Graph
8. Curriculum progression matrix
9. Methodology Engine / Methodology Packs
10. Methodical Constructor
11. Organizational Form control
12. UMK knowledge base / RAG
13. Source provenance / Evidence Engine
14. Time Feasibility Validator
15. Consistency / Difficulty Validators
16. Scenario / Materials / Export
17. Production observability + benchmark gates
```

Инфраструктурные задачи не должны затмевать teacher-authority и педагогическую continuity.

---

# 23. TROUBLESHOOTING

## 23.1 API не стартует: `DATABASE_URL is required`

Проверьте `.env` и локальный PostgreSQL.

```bash
docker compose -f compose.dev.yml up -d
```

## 23.2 PostgreSQL TLS error

Проверьте:

```dotenv
DB_SSL=verify-full
DB_SSL_CA_PATH=/path/to/ca.pem
```

Не отключайте certificate verification в production без осознанного решения.

## 23.3 Mutation возвращает 403

Проверить:

- session cookie;
- `x-workspace-id`;
- membership;
- permission;
- `x-csrf-token` для mutation.

## 23.4 Mutation возвращает 409

Вероятнее всего optimistic concurrency сработал правильно.

Клиент должен перезагрузить актуальный lesson и предложить пользователю повторить изменение поверх свежей версии.

## 23.5 AI proposal остаётся `QUEUED`

На `main` это ожидаемо до production wiring worker execution. Не подменять реальную AI completion fake-результатами для «красивого UI».

## 23.6 Smoke test падает

Не отключать проверку и не добавлять `|| true` вокруг критического smoke. Сначала выяснить, какой invariant нарушен.

---

# 24. ИНВАРИАНТЫ, КОТОРЫЕ НЕЛЬЗЯ НАРУШАТЬ

1. **AI не перезаписывает `APPROVED` решение педагога.**
2. **Downstream generation использует только approved teacher-controlled values и разрешённые source data.**
3. **Изменение upstream decision инвалидирует зависимости, а не молча переписывает их.**
4. **AI proposal хранится отдельно от authoritative decision.**
5. **Каждый tenant-owned DB query scoped by workspace.**
6. **State-changing authenticated API требует CSRF.**
7. **Raw session tokens, passwords и provider secrets не хранятся в открытом виде.**
8. **PostgreSQL — source of truth; queue/provider не authoritative.**
9. **Нельзя выдавать AI-generated historical text за подлинный источник или точное содержание УМК.**
10. **Нельзя использовать название УМК как замену реальному retrieval.**
11. **Formalizable validation делается deterministic code, а не LLM.**
12. **Новая migration добавляется новым файлом; applied migrations не переписываются.**
13. **Infrastructure vendor details не проникают в domain/application.**
14. **Model — сменный инструмент; model routing — policy.**
15. **Итоговая технологическая карта собирается из утверждённых решений, а не генерируется заново поверх них.**

---

## Связанные документы

- `RULS.md` — обязательные правила для AI coding agents;
- `README.md` — краткое описание проекта;
- `docs/architecture/overview.md` — target architecture;
- `docs/architecture/principles.md` — архитектурные принципы;
- `docs/architecture/ai-governance.md` — AI governance;
- `docs/architecture/security-tenancy.md` — security / tenancy;
- `docs/architecture/api-contracts.md` — API conventions;
- `docs/architecture/data-versioning.md` — versioning policy;
- `docs/architecture/testing-strategy.md` — testing strategy;
- `docs/adr/` — architecture decisions.

---

**Правило актуальности документа:** при изменении архитектурного инварианта, public API, схемы AI governance, authentication model, deployment topology или структуры monorepo этот документ обновляется в том же PR, что и изменение кода.
