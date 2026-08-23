# Tehkarta — план разработки на ближайшие 24 часа

**Окно работы:** 24 августа 2026 г. (примерно с 00:00 до 24:00 по локальному времени пользователя)  
**Репозиторий:** `resarytrew/Tehkarta`  
**Режим:** последовательная senior-level разработка по команде пользователя `продолжай`  
**Цель суток:** превратить текущий foundation в первый безопасный end-to-end AI-assisted vertical slice: педагог запрашивает AI-вариант → worker генерирует предложение → педагог видит его → педагог явно применяет → authoritative lesson state меняется только как решение педагога.

> Этот файл — рабочая очередь на сутки. После каждого завершённого блока агент обязан обновить статусы ниже, зафиксировать ссылку/номер PR или commit, проверить CI и только затем переходить к следующему блоку.

---

## 0. Протокол работы по команде `продолжай`

Когда пользователь пишет только **`продолжай`**, агент обязан:

1. Прочитать `RULS.md`.
2. Прочитать `TECHNICAL_DOCUMENTATION.md`.
3. Прочитать этот файл и определить **первый незавершённый блок с наивысшим приоритетом**.
4. Проверить фактическое состояние `main`, активных PR и CI — не полагаться на память разговора.
5. Выполнить один законченный инженерный блок целиком: код → тесты → CI → исправления → PR/merge, если безопасно.
6. Не спрашивать пользователя о выборе реализации, если решение можно принять безопасно на уровне senior-инженера.
7. Задать вопрос только при настоящем внешнем блокере: нужен секрет, платёжный/облачный доступ, юридическое решение, лицензия или необратимое продуктовое решение.
8. После работы обновить этот файл: статус, результат, следующий шаг.
9. В ответе пользователю кратко сообщить: что сделано, что проверено, что будет следующим по `продолжай`.

### Жёсткие ограничения

- Не сливать PR при красном CI.
- Не подменять `APPROVED` teacher state AI-результатом.
- Не создавать fake AI completion ради красивого UI.
- Не коммитить секреты.
- Не обходить workspace/authorization/CSRF ограничения.
- Не удалять проверки, чтобы «починить» CI.
- Не строить новую функцию напрямую на vendor SDK, если она должна проходить через port/adapter.
- Не усложнять архитектуру микросервисами без необходимости: modular monolith first.

---

# P0 — ЗАВЕРШИТЬ AI WORKER CORE

## [ ] 1. Довести PR #12 до зелёного состояния

**Текущий контекст:** `feature/ai-proposal-worker-core`, PR #12 `Build safe AI proposal worker core`.

Задачи:

- проверить актуальный head PR и CI;
- разобрать текущий `db:smoke` failure по фактическим логам;
- исправить очередь/время/lease/state-transition без ослабления теста;
- убедиться, что `typecheck`, `build`, `test`, `db:smoke`, Docker image и Terraform проходят;
- синхронизировать ветку с актуальным `main`, не потеряв `RULS.md`, `TECHNICAL_DOCUMENTATION.md` и этот план;
- перевести PR из draft в ready;
- merge только при полностью зелёном CI.

**Definition of Done:** worker безопасно доводит `QUEUED → RUNNING → READY`, stale work не вызывает модель, approved teacher decision остаётся неизменным.

---

# P1 — ПОЛНЫЙ TEACHER-AUTHORITY ЦИКЛ AI ПРЕДЛОЖЕНИЯ

## [ ] 2. Реализовать `READY proposal → просмотр → выбор кандидата`

Создать отдельный product slice:

- API получения proposal details/status;
- UI карточка кандидатов под конкретным governed field;
- `rationale` и `distinction` показываются отдельно от текста поля;
- `QUEUED/RUNNING/READY/FAILED/STALE` имеют понятные состояния;
- polling с backoff или другой лёгкий механизм обновления статуса;
- никаких автоматических замен lesson field.

**DoD:** педагог видит реальные READY-кандидаты и понимает их происхождение/статус.

## [ ] 3. Реализовать явное применение AI-кандидата педагогом

Отдельная application-команда, например `ApplyLessonAiProposalCandidate`.

Требования:

- применение возможно только для `READY` proposal;
- проверяется актуальная lesson version и base revision;
- stale proposal применить нельзя;
- provenance сохраняет `proposalId`, provider/model/prompt version;
- authoritative field после действия имеет семантику **teacher decision**, а не «AI сам применил»;
- downstream invalidations создаются так же, как при обычной ручной правке;
- после применения proposal становится `APPLIED`;
- повторное применение идемпотентно либо явно конфликтует по устойчивому contract.

**Критический тест:** старый баг с проблемным вопросом не может повториться.

## [ ] 4. Добавить `Отклонить` и `Запросить ещё варианты`

- `DISMISSED` как отдельное terminal state;
- отклонение не меняет lesson;
- новый запрос создаёт новый proposal, а не мутирует старый;
- UI сохраняет историю предложений по полю.

---

# P2 — PRODUCTION AI EXECUTION

## [ ] 5. Создать настоящий `apps/worker`

Отдельный runtime-процесс в монорепо:

```text
apps/worker
  → claim async job
  → build approved context
  → route model
  → invoke provider
  → validate structured output
  → persist result
```

Требования:

- graceful shutdown;
- worker identity;
- configurable poll interval / one-shot mode;
- lease recovery;
- retries with bounded exponential backoff;
- structured logging без чувствительных prompt payloads;
- health/readiness contract для контейнерного запуска.

## [ ] 6. Production-ready AI provider adapters

Добавить минимум два адаптера за `AIProvider`:

- Yandex AI Studio / OpenAI-compatible path;
- OpenRouter fallback/benchmark path.

Требования:

- secrets только через environment/Lockbox;
- timeout + AbortSignal;
- retry только для retryable failures;
- structured JSON output validation;
- provider/model metadata сохраняются;
- no silent fallback на модель с другой педагогической политикой;
- model routing policy versioned.

## [ ] 7. AI traceability и eval fixture

Зафиксировать для каждого AI вызова:

- task type;
- proposal id;
- provider/model;
- prompt version;
- routing policy version;
- latency;
- token/cost metadata, если провайдер отдаёт;
- result status;
- error category.

Добавить benchmark fixture для урока:

**«Экономика делает решающий рывок»**

и обязательного teacher question:

**«Почему в XIX в. промышленная революция достигла огромных успехов?»**

---

# P3 — END-TO-END PRODUCT SLICE

## [ ] 8. Собрать локальный end-to-end сценарий

Одной командой разработчика:

```text
docker compose up postgres
pnpm db:migrate
pnpm db:bootstrap-dev
pnpm dev
pnpm worker:dev
```

Сценарий проверки:

1. login;
2. открыть курс История 9;
3. открыть раздел «Начало индустриальной эпохи»;
4. открыть урок «Экономика делает решающий рывок»;
5. увидеть approved problem question;
6. нажать «Улучшить»;
7. дождаться READY proposal;
8. сравнить исходную и AI-формулировку;
9. применить вариант;
10. увидеть новое teacher-approved authoritative state и invalidations;
11. обновить страницу — состояние не теряется.

## [ ] 9. Добавить API/browser integration tests критического потока

Минимум:

- login → lesson → queue proposal → worker → READY → apply;
- stale conflict;
- tenant isolation;
- CSRF rejection;
- approved-state preservation;
- duplicate/idempotency behavior;
- refresh/reload persistence.

Не подменять integration test только unit-тестами.

---

# P4 — YANDEX CLOUD RUNTIME FOUNDATION

## [ ] 10. Завершить Terraform runtime-каркас

Довести `infra/terraform` до связной dev-среды:

- VPC/subnets;
- Managed PostgreSQL;
- private Object Storage buckets;
- Container Registry;
- API Serverless Container;
- Worker Serverless Container;
- service accounts и least privilege IAM;
- Lockbox bindings;
- API Gateway;
- web static hosting/CDN foundation;
- outputs для deploy pipeline.

Не применять реальные облачные ресурсы без доступных credentials и без явной уверенности в стоимости/безопасности. Если credentials отсутствуют — довести IaC до `fmt/validate` и документировать apply steps.

## [ ] 11. Развести runtime identities

Минимум:

- `tehkarta-api-runtime`;
- `tehkarta-worker-runtime`;
- `tehkarta-deploy`;
- позже `tehkarta-content-importer`.

Принцип least privilege обязателен.

## [ ] 12. Подготовить CI/CD skeleton

Без секретов в Git:

- build API image;
- build worker image;
- immutable image tags by commit SHA;
- Terraform validation;
- deploy job только для protected environment;
- migration step отделён от application start;
- rollback/runbook заметка.

---

# P5 — СЛЕДУЮЩИЙ ПЕДАГОГИЧЕСКИЙ СЛОЙ

Если P0–P4 завершены раньше конца рабочего окна, перейти к следующему product foundation.

## [ ] 13. Methodical Constructor domain foundation

Не UI-first. Сначала структура:

```text
PedagogicalTechnology
  → canonical phases
  → Methods
      → Techniques
      → compatible Forms
      → time cost
      → prep cost
      → constraints
      → anti-patterns
```

Добавить versioned `MethodologyPack` и source/provenance.

## [ ] 14. Первый Methodology Pack: исследовательская технология

Структурировать:

- проблема;
- исследовательский вопрос;
- гипотезы;
- план исследования;
- анализ источников/данных;
- интерпретация;
- вывод;
- рефлексия;
- методы/приёмы/формы;
- возрастные и временные ограничения;
- anti-patterns.

## [ ] 15. UI первого Методического конструктора

Для текущего урока показать AI recommendations с объяснением:

- почему метод рекомендован;
- какой approved outcome поддерживает;
- какая technology phase;
- сколько времени;
- рекомендуемые приёмы;
- форма работы выбирается отдельно;
- `[Использовать] [Не использовать] [Подробнее]`.

Никакой автоматической установки group work.

---

# P6 — ДОКУМЕНТАЦИЯ И HOUSEKEEPING

## [ ] 16. В конце суток провести документационный checkpoint

Обновить:

- `TECHNICAL_DOCUMENTATION.md` — только фактически реализованные компоненты;
- `RULS.md` — только если появился новый устойчивый архитектурный invariant;
- этот файл — отметить завершённые блоки и перенести незавершённые в следующий план;
- ADR для новых значимых решений;
- README — только если пользовательский/dev workflow реально изменился.

Провести финальную проверку:

```text
pnpm typecheck
pnpm build
pnpm test
pnpm db:smoke
terraform fmt -check
terraform validate
Docker API build
Docker worker build (если уже реализован)
```

---

# Что НЕ делать в эти сутки

Чтобы не распылять разработку:

- не строить весь RAG по полным учебникам до завершения AI proposal E2E;
- не начинать billing;
- не добавлять учеников/родителей;
- не проектировать мобильное приложение;
- не строить микросервисы;
- не делать массовый импорт всех предметов;
- не заниматься декоративным редизайном раньше рабочего vertical slice;
- не внедрять сложный Redis/Valkey слой без измеренной потребности;
- не добавлять внешние AI-фичи, которые обходят teacher-authority model.

---

# Критерий успеха к концу суток

К концу этого рабочего окна платформа должна максимально приблизиться к следующему доказуемому состоянию:

```text
ПЕДАГОГ
  ↓
утверждённое решение
  ↓
«Улучшить / Варианты»
  ↓
асинхронный безопасный worker
  ↓
реальный AI provider
  ↓
отдельные AI candidates
  ↓
педагог сравнивает
  ↓
явно применяет
  ↓
новая teacher-authoritative revision
  ↓
dependency invalidation
  ↓
полный audit/provenance
```

Приоритет качества: **корректность состояния и доверие педагога важнее количества экранов и функций.**

---

## Журнал выполнения

| Блок | Статус | PR / commit | Примечание |
|---|---|---|---|
| 1. PR #12 worker core | ⏳ | PR #12 | Первый блок следующей команды `продолжай` |
| 2. Proposal review UI | ⬜ | — | — |
| 3. Apply candidate | ⬜ | — | — |
| 4. Dismiss/history | ⬜ | — | — |
| 5. apps/worker | ⬜ | — | — |
| 6. AI providers | ⬜ | — | — |
| 7. AI trace/evals | ⬜ | — | — |
| 8. Local E2E | ⬜ | — | — |
| 9. Integration tests | ⬜ | — | — |
| 10. Yandex Terraform | ⬜ | — | — |
| 11. Runtime identities | ⬜ | — | — |
| 12. CI/CD skeleton | ⬜ | — | — |
| 13–15. Methodology | ⬜ | — | Только после P0–P4 |
| 16. Docs checkpoint | ⬜ | — | Конец окна |
