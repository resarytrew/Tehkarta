# Tehkarta

AI-среда совместного педагогического проектирования: курс → раздел → урок → этап → материалы.

Педагог остаётся автором решений; AI выступает методистом и работает только в рамках утверждённого педагогом контекста. Утверждённые решения не переписываются моделью автоматически.

## Что уже работает

Первый teacher-authoritative vertical slice включает:

```text
цель / проблемный вопрос / большая идея
→ AI proposal
→ durable worker
→ READY candidates
→ явный Apply / Dismiss педагогом
→ TEACHER + APPROVED revision
→ dependency invalidation + provenance
```

Также реализован первый `03 Методический конструктор`:

```text
APPROVED outcome
→ исследовательская технология
→ объяснимая рекомендация метода
→ отдельный выбор приёмов
→ отдельный выбор формы организации
→ Использовать / Не использовать
```

Групповая работа моделируется как организационная форма, а не как метод.

## Локальный запуск

```bash
pnpm install

docker compose -f compose.dev.yml up -d postgres
export DATABASE_URL=postgres://tehkarta:tehkarta@localhost:5432/tehkarta
pnpm db:migrate

export DEV_BOOTSTRAP_EMAIL=teacher@example.test
export DEV_BOOTSTRAP_PASSWORD='change-this-local-password'
pnpm db:bootstrap-dev

# терминал 1: API + web
pnpm dev

# терминал 2: AI worker; нужны явные AI_* route variables и provider key
pnpm worker:dev
```

Для критического teacher-authority потока без обращения к внешней модели используется integration harness:

```bash
pnpm e2e:critical
```

Он проходит реальный HTTP/API + PostgreSQL путь: login → edit/approve → AI proposal queue → worker processor → READY → explicit Apply → reload. Тестовый generator существует только внутри test harness и никогда не включается в обычный runtime или UI.

Обычный CI дополнительно проверяет Methodical Constructor: approved-only recommendations, CSRF, explicit teacher application, downstream invalidation, durable reject feedback и persistence after reload.

## Архитектура и правила

Перед разработкой прочитать:

1. `RULS.md`;
2. `TECHNICAL_DOCUMENTATION.md`;
3. `docs/WORK_PLAN_24H.md`;
4. релевантные `docs/adr/*`.

Целевая инфраструктура описана Terraform-кодом для Yandex Cloud. Наличие IaC в репозитории **не означает**, что реальные облачные ресурсы уже provisioned: `terraform apply` требует операторских Yandex Cloud credentials и не выполняется в обычном CI.

## Следующий продуктовый слой

Следующий приоритет — централизованный versioned RP/UMK Content layer и реальный шаг `04 Содержание УМК`, после чего можно проектировать `05 Сценарий` на основе утверждённых outcomes, methodology и content evidence.
