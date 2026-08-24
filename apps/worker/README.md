# Tehkarta Worker

`apps/worker` is the production runtime that executes durable AI proposal jobs.
It composes application use cases with PostgreSQL repositories and the provider-neutral AI layer; it never writes AI output directly into authoritative lesson decisions.

## Modes

- `WORKER_MODE=poll` — long-running polling runtime. Claims available jobs, drains work, sleeps only when idle, and recovers from runtime-level infrastructure failures with bounded backoff.
- `WORKER_MODE=once` — claims and executes at most one job, then exits. Useful for schedulers, diagnostics and future message-triggered invocations.

The queue-level lease recovery and bounded job retries remain in `PostgresAsyncJobProcessingRepository` / `RunNextLessonDecisionProposalJob`; the runtime does not duplicate those semantics.

## Health

Polling mode exposes:

- `GET /healthz` — process liveness;
- `GET /readyz` — readiness backed by a lightweight PostgreSQL check; returns 503 during shutdown or when the database is unavailable.

Health responses never expose credentials, provider errors, prompts or lesson content.

## Local development

1. Start PostgreSQL and run migrations/bootstrap.
2. Configure `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` and optional worker variables from `.env.example`.
3. Start API/web with `pnpm dev`.
4. Start the worker separately with `pnpm worker:dev`.

Use `pnpm worker:once` to process at most one available proposal job.
