# Tehkarta — 24h development checkpoint

**Окно работы:** 24 августа 2026 г.  
**Репозиторий:** `resarytrew/Tehkarta`  
**Режим:** последовательная senior-level разработка по команде пользователя `продолжай` / `делай сразу всё`.

## Главный результат

Зафиксирован и проверен первый полноценный teacher-authoritative vertical slice Tehkarta:

```text
Педагог утверждает контекст
        ↓
AI proposal создаётся отдельно
        ↓
async worker обрабатывает задачу
        ↓
READY candidate показывается педагогу
        ↓
педагог выбирает и явно применяет
        ↓
TEACHER + APPROVED revision
        ↓
dependency invalidation + provenance + audit
```

Параллельно завершён первый vertical slice Методического конструктора:

```text
APPROVED outcome
      ↓
versioned Methodology Pack
      ↓
объяснимая рекомендация метода
      ↓
отдельный выбор приёмов
      ↓
отдельный выбор формы организации
      ↓
[Использовать] / [Не использовать]
      ↓
явное решение педагога
      ↓
TEACHER + APPROVED methodology state
```

## Протокол по команде `продолжай`

1. Прочитать `RULS.md`, `TECHNICAL_DOCUMENTATION.md` и этот checkpoint.
2. Проверить фактическое состояние `main`, активных PR и CI.
3. Брать первый незавершённый продуктовый slice, а не создавать параллельную архитектуру ради архитектуры.
4. Выполнять цикл `код → тесты → CI → исправления → merge`.
5. Не спрашивать о технической реализации, если решение безопасно принять на уровне senior-инженера.
6. Останавливать только на внешнем блокере: secrets/cloud access, лицензия, стоимость или необратимое продуктовое решение.
7. Не сливать красный CI.

## Неизменяемые инварианты

- `APPROVED` teacher state не меняется AI автоматически.
- AI proposal хранится отдельно от `lesson_decisions`.
- Нижние этапы используют только утверждённый педагогом контекст.
- Изменение утверждённого upstream-решения помечает зависимости stale, а не молча переписывает их.
- Method, Technique и Organizational Form — разные сущности.
- Групповая работа — форма организации, а не метод.
- Workspace authorization и CSRF не обходятся.
- Секреты не попадают в Git, frontend или логи.
- Красный тест исправляется по причине, а не удалением проверки.
- Modular monolith first.

---

# Выполнено

## P0 — AI worker core ✅

- PR #12: durable AI proposal worker core.
- `QUEUED → RUNNING → READY / STALE / FAILED`.
- stale work проверяется до вызова модели.
- worker не пишет в authoritative lesson state.

## P1 — полный teacher-authority цикл AI proposal ✅

- PR #13: просмотр READY candidates, rationale/distinction, bounded polling.
- PR #14: explicit Apply; AI candidate становится authoritative только после действия педагога.
- PR #15: explicit Dismiss, история предложений и teacher provenance.
- optimistic concurrency, stale/base revision checks, tenant scope и CSRF сохранены.

## P2 — production AI execution ✅

- PR #16: отдельный `apps/worker`, `poll`/`once`, graceful shutdown, health/readiness, bounded backoff, non-root Docker runtime.
- PR #17: Yandex AI Studio + OpenRouter adapters, explicit model routing, no silent fallback, typed retryability, timeout, structured output, metadata traceability.
- provider/model/prompt/routing/input hash/latency/token/cost metadata сохраняются вокруг AI invocation.
- benchmark использует урок «Экономика делает решающий рывок» и утверждённый вопрос «Почему в XIX в. промышленная революция достигла огромных успехов?».

## P3 — end-to-end product slice ✅

- PR #18: login → governed decision → AI proposal → worker → READY → explicit Apply → reload.
- проверяются CSRF, tenant isolation, idempotency, persistence и preservation of teacher authority.

## P4 — Yandex Cloud runtime foundation ✅

- PR #19, merge `ce8f2d0abad17df0ba4ee2dbbd21ab0d05815713`.
- Terraform dev foundation: VPC, Managed PostgreSQL, private Object Storage, API/worker Container Registry, API Serverless Container, task-mode worker, API Gateway, Lockbox wiring, least-privilege service accounts, static web Object Storage/CDN foundation, deploy identity and runbook.
- CI выполняет Terraform `fmt/init/validate` без облачных credentials.
- production API и worker images проверяются как non-root.
- **Реальный `terraform apply` не выполнялся:** создание облачных ресурсов требует Yandex Cloud credentials, Lockbox payloads и при необходимости владения DNS/domain.

## P5 — Methodical Constructor v1 ✅

### Domain/application foundation

- PR #20, merge `96298471602ea76b156991d349272aae931ae053`.
- versioned `MethodologyPack`.
- первая технология: исследовательская.
- canonical phases, methods, techniques, forms, time/preparation/constraints/anti-patterns.
- deterministic/explainable recommendation engine использует только `APPROVED outcomes`.
- causal outcome приоритизирует `Проверку гипотез`.
- `Использовать` создаёт `TEACHER + APPROVED` method/techniques/form.
- `Не использовать` сохраняется как teacher feedback в PostgreSQL.

### Teacher UI

- PR #21, merge `440d4cf88d25cfa9364831078121cef83e0dda7d`.
- шаг `03 Методический конструктор` реально доступен в lesson workspace.
- педагог видит approved outcome, technology phase, recommended method, rationale, время, ограничения и anti-patterns.
- приёмы выбираются отдельно.
- форма организации выбирается отдельно.
- доступны `[Использовать] [Не использовать] [Подробнее]`.
- можно добавить и сразу утвердить результат урока.
- интеграционный тест подтверждает: без APPROVED outcome рекомендаций нет; CSRF обязателен; causal outcome даёт hypothesis-testing; explicit Use сохраняет `TEACHER + APPROVED`; downstream content становится stale; reject сохраняется; reload восстанавливает authoritative state.
- CI также выявил слишком длинный route parameter для recommendation ID; ID сокращён до стабильного router-safe формата вместо увеличения лимита маршрутизатора.

---

# CI checkpoint

На последнем продуктовом PR #21 успешно прошли:

```text
pnpm typecheck
pnpm build
pnpm test
pnpm db:smoke
Docker API build + non-root assertion
Docker worker build + non-root assertion
terraform fmt -check
terraform init -backend=false
terraform validate
```

---

# Следующий приоритет после checkpoint

Не расширять инфраструктуру без необходимости. Следующий продуктовый слой:

1. **Content/RP/UMK foundation** — централизованный versioned Content Pack, semantic UMK ingestion и provenance.
2. Связать approved outcomes + methodology с реальными RP requirements и UMK evidence.
3. Реализовать шаг `04 Содержание УМК` с режимами:
   - строго по УМК;
   - УМК + проверенные дополнительные материалы;
   - расширенный.
4. Маркировать каждый элемент содержания как:
   - `ОБЯЗАТЕЛЬНО ПО РП`;
   - `СОДЕРЖИТСЯ В УМК`;
   - `РЕКОМЕНДУЕТ AI ДОПОЛНИТЕЛЬНО`.
5. Только после надёжного content layer переходить к шагу `05 Сценарий` и генерации этапов урока.

## Что пока не делать

- не строить billing;
- не расширять роли ученик/родитель раньше teacher workflow;
- не импортировать все предметы сразу;
- не делать микросервисный split без измеримой причины;
- не считать центральный коммерческий УМК доступным без проверки лицензии/прав;
- не выдавать AI reconstruction за исторический источник;
- не выполнять реальный Yandex Cloud deploy без явных credentials и операторского контекста.
