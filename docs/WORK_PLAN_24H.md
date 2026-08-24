# Tehkarta — план разработки на ближайшие 24 часа

**Окно работы:** 24 августа 2026 г.  
**Репозиторий:** `resarytrew/Tehkarta`  
**Режим:** последовательная senior-level разработка по команде пользователя `продолжай`  
**Цель суток:** довести первый безопасный end-to-end AI-assisted vertical slice: педагог запрашивает AI-вариант → worker генерирует предложение → педагог видит его → педагог явно применяет → authoritative lesson state меняется только как решение педагога.

> После каждого законченного блока агент обязан проверить фактическое состояние `main`, CI и активных PR, затем обновить этот файл.

---

## 0. Протокол по команде `продолжай`

1. Прочитать `RULS.md`, `TECHNICAL_DOCUMENTATION.md` и этот файл.
2. Проверить реальное состояние `main`, PR и CI — не полагаться только на память разговора.
3. Взять первый незавершённый блок с наивысшим приоритетом.
4. Выполнить законченный инженерный slice: код → тесты → CI → исправления → merge, если безопасно.
5. Не спрашивать пользователя о реализации, если решение можно принять безопасно на уровне senior-инженера.
6. Задать вопрос только при внешнем блокере: secret/cloud access, лицензия, стоимость или необратимое продуктовое решение.
7. Не сливать PR при красном CI.
8. Обновить этот план и кратко сообщить результат.

### Жёсткие ограничения

- `APPROVED` teacher state не меняется AI автоматически.
- AI proposal хранится отдельно от `lesson_decisions`.
- Никаких fake AI completion ради UI.
- Никаких секретов в Git/frontend/logs.
- Workspace/authorization/CSRF не обходить.
- Не удалять проверки ради зелёного CI.
- Vendor SDK не должен проникать в domain/application.
- Modular monolith first.

---

# P0 — AI WORKER CORE

## [x] 1. Довести PR #12 до зелёного состояния

**Результат:** завершено и влито в `main`.

- PR #12 `Build safe AI proposal worker core`;
- green head: `96e7b78776cc598f518374ee284c8d0072b0cefe`;
- merge: `f9f3196d3db644433f7741217bbca65795f3ce8c`;
- проходят typecheck/build/test/db:smoke/Docker/Terraform;
- worker lifecycle: `QUEUED → RUNNING → READY / STALE / FAILED`;
- stale work не вызывает модель;
- approved teacher decision не изменяется.

---

# P1 — ПОЛНЫЙ TEACHER-AUTHORITY ЦИКЛ AI ПРЕДЛОЖЕНИЯ

## [x] 2. `READY proposal → просмотр → выбор кандидата`

**Результат:** завершено и влито в `main`.

- PR #13 `Show READY AI proposal candidates safely`;
- green head: `233802ecca5c24802bd0cabf7f30bbb843a82a29`;
- squash merge: `fdbb846109897683d4dd28aeafb48fbd39f3e1e1`;
- добавлен tenant-scoped detail endpoint `GET /api/v1/lessons/:lessonId/ai-proposals/:proposalId`;
- repository contract теперь явно предоставляет `getById`;
- UI показывает реальные candidates, `rationale` и `distinction`;
- `QUEUED/RUNNING` автоматически polling-ятся с bounded backoff;
- READY/STALE/FAILED/CANCELLED имеют отдельное представление;
- педагог может выбрать candidate локально, но выбор **не меняет lesson state**;
- provider/model/prompt/base revision показываются как provenance metadata, когда доступны;
- CI полностью зелёный: verify, db:smoke, Docker non-root, Terraform.

## [ ] 3. Явное применение AI-кандидата педагогом

Создать application-команду `ApplyLessonAiProposalCandidate`.

Требования:

- только `READY` proposal;
- candidate обязан принадлежать proposal;
- proposal обязан принадлежать текущему lesson/workspace;
- проверить `requestedLessonVersion`, `baseDecisionId`, `baseRevision` против актуального state;
- stale proposal применить нельзя;
- применение должно быть **teacher action** с actor user ID;
- AI не пишет напрямую в authoritative decision;
- provenance сохраняет `proposalId`, `candidateId`, provider/model/prompt/routing policy;
- downstream dependency invalidations создаются так же, как при ручной правке;
- итоговое поле получает teacher-authoritative semantics;
- proposal переходит `READY → APPLIED` только атомарно с успешным применением;
- повтор должен быть идемпотентным либо давать устойчивый conflict contract;
- критический regression fixture: вопрос «Почему в XIX в. промышленная революция достигла огромных успехов?» не может быть заменён без явного Apply.

**DoD:** candidate можно применить одной явной кнопкой, после reload сохраняется новое teacher-controlled state; никакого silent overwrite.

## [ ] 4. `Отклонить` и `Запросить ещё варианты`

- `DISMISSED` как terminal state;
- dismiss не меняет lesson;
- новый запрос создаёт новый proposal;
- история предложений сохраняется по полю.

---

# P2 — PRODUCTION AI EXECUTION

## [ ] 5. Создать настоящий `apps/worker`

```text
apps/worker
  → claim async job
  → build approved context
  → route model
  → invoke provider
  → validate structured output
  → persist result
```

Требования: graceful shutdown, worker identity, poll/one-shot mode, lease recovery, bounded retries, structured logging без чувствительных payloads, health/readiness.

## [ ] 6. Production-ready AI provider adapters

Минимум:

- Yandex AI Studio / OpenAI-compatible adapter;
- OpenRouter benchmark/fallback adapter.

Требования: secrets только runtime/Lockbox, timeout + AbortSignal, retry только retryable errors, JSON schema validation, metadata persistence, versioned routing policy, никакого silent fallback с другой педагогической политикой.

## [ ] 7. AI traceability и eval fixture

Хранить: task type, proposal ID, provider/model, prompt/routing version, latency, token/cost metadata, status, error category.

Benchmark fixture:

- урок «Экономика делает решающий рывок»;
- approved question «Почему в XIX в. промышленная революция достигла огромных успехов?».

---

# P3 — END-TO-END PRODUCT SLICE

## [ ] 8. Локальный E2E

```text
docker compose up postgres
pnpm db:migrate
pnpm db:bootstrap-dev
pnpm dev
pnpm worker:dev
```

Сценарий: login → История 9 → «Начало индустриальной эпохи» → «Экономика делает решающий рывок» → «Улучшить» → READY proposal → сравнить → Apply → teacher-authoritative state + invalidations → reload → данные сохранены.

## [ ] 9. Integration tests критического потока

Минимум:

- login → proposal → worker → READY → apply;
- stale conflict;
- tenant isolation;
- CSRF rejection;
- approved-state preservation;
- idempotency;
- persistence after reload.

---

# P4 — YANDEX CLOUD RUNTIME FOUNDATION

## [ ] 10. Завершить Terraform dev-runtime

- VPC/subnets;
- Managed PostgreSQL;
- private Object Storage;
- Container Registry;
- API Serverless Container;
- Worker Serverless Container;
- separate service accounts + least privilege IAM;
- Lockbox;
- API Gateway;
- web static hosting/CDN;
- deploy outputs.

Без credentials не делать реальный `apply`: довести IaC до `fmt/validate` и документировать apply/runbook.

## [ ] 11. Runtime identities

Минимум: `tehkarta-api-runtime`, `tehkarta-worker-runtime`, `tehkarta-deploy`; позже `tehkarta-content-importer`.

## [ ] 12. CI/CD skeleton

- API + worker images;
- immutable SHA tags;
- Terraform validation;
- protected deploy environment;
- migrations отдельным шагом;
- rollback/runbook.

---

# P5 — СЛЕДУЮЩИЙ ПЕДАГОГИЧЕСКИЙ СЛОЙ

После P0–P4.

## [ ] 13. Methodical Constructor domain foundation

`PedagogicalTechnology → canonical phases → Methods → Techniques → compatible Forms → time/prep/constraints/anti-patterns`.

Versioned `MethodologyPack` + provenance.

## [ ] 14. Первый Methodology Pack: исследовательская технология

Проблема → вопрос → гипотезы → план → анализ источников/данных → интерпретация → вывод → рефлексия + methods/techniques/forms + возрастные/временные ограничения + anti-patterns.

## [ ] 15. UI первого Методического конструктора

AI recommendation должен объяснять: почему метод, какой approved outcome, какая technology phase, время, приёмы. Форма работы выбирается отдельно. Действия: `[Использовать] [Не использовать] [Подробнее]`.

---

# P6 — ДОКУМЕНТАЦИЯ И HOUSEKEEPING

## [ ] 16. Финальный checkpoint суток

Обновить `TECHNICAL_DOCUMENTATION.md`, этот план, ADR при новых архитектурных решениях и README только при реальном изменении dev/user workflow.

Финальная проверка:

```text
pnpm typecheck
pnpm build
pnpm test
pnpm db:smoke
terraform fmt -check
terraform validate
Docker API build
Docker worker build (если реализован)
```

---

# Что НЕ делать в эти сутки

- не строить полный RAG до AI proposal E2E;
- не начинать billing;
- не добавлять учеников/родителей;
- не проектировать мобильное приложение;
- не строить микросервисы;
- не импортировать массово все предметы;
- не заниматься декоративным редизайном раньше рабочего vertical slice;
- не менять архитектурные инварианты ради краткосрочного удобства.
