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

## [x] 3. Явное применение AI-кандидата педагогом

**Результат:** завершено и влито в `main`.

- PR #14 `Apply AI proposal candidates only by explicit teacher action`;
- green head: `5fb207a5233dafe883c7914ccf36272d4eae71f7`;
- squash merge: `b69987eb831587077c21796fc07813b5e72b270c`;
- создан отдельный use case `ApplyLessonAiProposalCandidate`;
- добавлен CSRF-protected endpoint `POST /api/v1/lessons/:lessonId/ai-proposals/:proposalId/apply`;
- только `READY` proposal может быть применён;
- candidate, workspace, lesson version, `baseDecisionId` и `baseRevision` повторно проверяются;
- PostgreSQL `FOR UPDATE` защищает proposal, lesson и governed decision от гонок;
- lesson decision, immutable revision history, dependency invalidations и `READY → APPLIED` фиксируются **одной транзакцией**;
- authoritative field сохраняется как `source=TEACHER`, `status=APPROVED`, с actor user ID;
- AI provenance сохраняется отдельно: proposal/candidate/provider/model/prompt/routing policy;
- повторное применение того же candidate идемпотентно, другой candidate после APPLIED даёт conflict;
- UI теперь требует два отдельных действия: `Выбрать` → `✓ Применить выбранный вариант`;
- regression smoke проверяет вопрос «Почему в XIX в. промышленная революция достигла огромных успехов?» и доказывает, что AI-текст становится authoritative только после явного Apply;
- CI полностью зелёный: typecheck/build/test/db:smoke, Docker non-root, Terraform.

## [x] 4. `Отклонить` и `Запросить ещё варианты`

**Результат:** завершено и влито в `main`.

- PR #15 `Add explicit AI proposal dismissal and field history`;
- green head: `309329ec824a554afc54228648ad53cf95da8fe5`;
- squash merge: `2d7a1164b409c9f6469a3ebaa33f6d3a03a08aed`;
- добавлен application use case `DismissLessonAiProposal`;
- `POST /api/v1/lessons/:lessonId/ai-proposals/:proposalId/dismiss` защищён CSRF и workspace authorization;
- только `READY` proposal переводится в `DISMISSED`, повторное отклонение идемпотентно;
- `dismissed_by` и `dismissed_at` сохраняют provenance явного решения педагога;
- отклонение не изменяет `lesson_decisions`, field revision или lesson version;
- `Запросить ещё варианты` создаёт новый AI proposal через существующий request use case, старый proposal не мутируется;
- UI хранит и показывает историю предложений по governed field;
- добавлен отдельный DB smoke для dismissal/history и сохранения teacher-authoritative state;
- первый CI выявил ошибку тестовой фикстуры (`completed_at` вместо реального `async_jobs.finished_at`); тест исправлен по фактическому queue schema, после чего полный CI зелёный;
- прошли typecheck/build/test/db:smoke, Docker production image + non-root assertion и Terraform validation.

---

# P2 — PRODUCTION AI EXECUTION

## [x] 5. Создать настоящий `apps/worker`

**Результат:** завершено и влито в `main`.

- PR #16 `Add production AI worker runtime`;
- green head: `8342d2ceaf9860cbf59a811e414087b3f4fe9eda`;
- squash merge: `9f88f54906c143814b5203bea0c9ea32c2c58996`;
- создан отдельный runtime `apps/worker`, который композиционно связывает durable PostgreSQL queue, approved-only lesson processor, AI router/provider и persistence результата;
- поддерживаются два режима: `WORKER_MODE=poll` для постоянной обработки очереди и `WORKER_MODE=once` для scheduler/message-driven запуска;
- стабильная worker identity задаётся `WORKER_ID`, с безопасным host:pid fallback;
- SIGTERM/SIGINT запускают graceful shutdown через AbortController;
- runtime-level infrastructure failures получают bounded exponential backoff, а job-level lease recovery и ограниченные retries остаются в существующих application/database слоях;
- структурированные JSON-логи содержат только operational metadata (job/proposal/status), без prompt, lesson content и секретов;
- добавлены `GET /healthz` и PostgreSQL-backed `GET /readyz`; readiness становится 503 при shutdown или недоступной БД;
- добавлены unit/integration-style runtime tests для one-shot, polling shutdown, backoff и health/readiness;
- создан production Node 22 Docker image worker, запускающийся от `USER node`;
- CI теперь собирает и проверяет non-root runtime как API, так и worker image;
- root scripts дополнены `pnpm worker:dev` и `pnpm worker:once`, `.env.example` документирует worker/provider-neutral runtime config;
- CI выявил две реальные проблемы: скрытую workspace-зависимость `database → identity` в worker image и преждевременное завершение node:test из-за unref polling timer; обе причины исправлены, не обходя проверки;
- финальный CI полностью зелёный: typecheck, build, tests, db:smoke, API+worker Docker non-root и Terraform validation.

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
