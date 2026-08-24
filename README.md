# Tehkarta

AI-среда совместного педагогического проектирования: курс → раздел → урок → этап → материалы.

Проект создаётся с нуля под Yandex Cloud. Педагог остаётся автором решений; AI выступает методистом и работает только в рамках утверждённого педагогом контекста, рабочей программы и подключённого УМК.

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

Для локальной/CI проверки критического teacher-authority потока без обращения к внешней модели используется отдельный integration harness:

```bash
pnpm e2e:critical
```

Он проходит реальный HTTP/API + PostgreSQL путь: login → edit/approve → AI proposal queue → worker processor → READY → explicit Apply → reload. Тестовый генератор существует только внутри test harness и никогда не включается в обычный runtime или UI.

## Статус

Идёт создание production-oriented vertical slice на примере курса истории 9 класса. Текущее фактическое состояние реализации фиксируется в `TECHNICAL_DOCUMENTATION.md` и `docs/WORK_PLAN_24H.md`.
