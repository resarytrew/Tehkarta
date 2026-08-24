# ADR 0008 — Yandex task worker over the durable PostgreSQL queue

- Status: Accepted for development baseline
- Date: 2026-08-24

## Context

Tehkarta already persists asynchronous AI proposal jobs in PostgreSQL with idempotency, leases, retries, stale-state detection and teacher-authority guarantees. Introducing a second durable queue before cloud traffic requires it would duplicate delivery semantics and make failure reasoning harder.

Yandex Serverless Containers supports task-mode revisions, and timer triggers can invoke a private container under a dedicated service account.

## Decision

For the development Yandex Cloud runtime:

1. Keep PostgreSQL `async_jobs` as the source of truth for queued AI proposal work.
2. Run `apps/worker` in a Serverless Container revision with `runtime.type=task`.
3. Force `WORKER_MODE=once` in cloud infrastructure.
4. Invoke the task on a timer (development default: once per minute).
5. Each task invocation performs readiness, claims at most one durable job, processes it and exits.
6. Grant the timer's service account only `serverless-containers.containerInvoker` on the worker container.
7. Keep worker image pull and Lockbox permissions on a separate worker runtime service account.

The timer is an execution trigger, not a source of queue truth. Its retry is bounded; application/database retry state remains authoritative.

## Consequences

### Positive

- one durable delivery model during the early product phase;
- no loss of existing idempotency/stale-state guarantees;
- inexpensive scale-to-zero execution for a low-volume development environment;
- infrastructure trigger can later change without rewriting pedagogical/application logic;
- API and worker remain independently deployable.

### Trade-offs

- timer latency is bounded by the schedule rather than event-immediate delivery;
- one-job-per-invocation throughput is intentionally low;
- high-volume production may require Message Queue/Event Router or another event-driven trigger.

## Upgrade condition

Revisit this ADR when measured queue latency/throughput shows that timer-driven task execution is insufficient. A replacement trigger must preserve:

- PostgreSQL job/proposal idempotency;
- stale proposal rejection before model invocation;
- no automatic mutation of `APPROVED` teacher state;
- provider traceability and bounded retries.
