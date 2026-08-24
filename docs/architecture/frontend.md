# Frontend feature architecture

`apps/web` организован вокруг предметных feature-модулей. `App.tsx` является composition root и подключает API, session actions и notifications; он не загружает lesson state и не выполняет mutations.

```text
App
└── TeacherWorkspace
    ├── CoursePlanning
    └── LessonDesigner
        ├── LessonWorkspace (read/load/refresh)
        ├── LessonIntent
        ├── AI Proposals
        ├── Methodology
        ├── Content Selection
        ├── Scenario
        ├── Materials
        ├── Expertise
        └── Lesson Map
```

## Ownership

- `app/` — shell, выбор курса/урока, URL selection и крупная композиция.
- `entities/` — frontend domain/API DTO по владельцам: course, lesson, proposal, methodology, content, artifact, session.
- `features/*/api` — feature endpoints поверх общего `ApiClient`.
- `features/*/model` — server-state orchestration, mutation busy state и минимальные refresh boundaries.
- `features/*/ui` — presentation и локальные drafts конкретной функции.
- `shared/api` — base URL, cookie credentials, workspace header, CSRF и общий разбор ответа.
- `shared/errors` — стабильная классификация `401/403/409/validation/network/server` и recovery policy.
- `shared/notifications` — единый notification service, не зависящий от `App.tsx`.
- `shared/auth` — session storage, login/logout и session boundary.

## Invariants

Feature decomposition не меняет teacher-authority модель:

```text
AI proposal → teacher choice → explicit Apply → APPROVED revision → invalidations
```

Governed mutations продолжают передавать `expectedLessonVersion` и `expectedFieldRevision`. После `409` UI загружает authoritative server state. Scenario/materials сохраняют generated-from lesson, course-context и artifact revisions.

Feature hooks не получают целиком `LessonWorkspace`. Каждый hook объявляет собственный dependency object только из необходимых данных и команд. Recovery после `DEPENDENCY_STALE` обновляет атомарный набор зависимостей функции: например, methodology загружает lesson и recommendation bundle, AI proposals — lesson и proposal history, а design artifacts — lesson, scenario context и artifacts.

`lesson-workflow` является readiness boundary. Для каждого шага вычисляется состояние `locked`, `available`, `complete` или `stale`, а `stepRefreshDependencies` задаёт точечные READ-зависимости при входе. Локальные scenario/materials drafts не сбрасываются, если сервер вернул эквивалентный lesson/context с теми же dependency revisions.

## Tests

```bash
pnpm --filter @tehkarta/web test
pnpm --filter @tehkarta/web typecheck
pnpm --filter @tehkarta/web build
pnpm --filter @tehkarta/web test:e2e
```

Playwright smoke проверяет login, lesson selection и restore после reload и выполняется отдельным CI job на изолированной PostgreSQL fixture. Полный мутационный поток запускается только с `TEHKARTA_E2E_MUTATIONS=1`, потому что он намеренно создаёт новые authoritative revisions и AI proposal.
