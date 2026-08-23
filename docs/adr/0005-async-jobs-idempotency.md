# ADR 0005: Durable async jobs with idempotency

- Status: Accepted
- Date: 2026-08-23

## Context

AI generation, document parsing, embeddings, imports, exports and bulk validations can outlive an HTTP request and may need retries.

## Decision

Long-running work is represented by a durable job record in PostgreSQL and dispatched through a queue.

Each job has:

- stable job ID;
- workspace ID;
- job type and schema version;
- idempotency key;
- status (`QUEUED`, `RUNNING`, `SUCCEEDED`, `FAILED`, `CANCELLED`);
- attempt count;
- input reference, not uncontrolled duplicated payloads;
- result/error metadata;
- timestamps.

Queue delivery is at-least-once. Workers must therefore be idempotent.

## Consequences

- retries do not duplicate lesson mutations;
- long operations are observable and resumable;
- queue implementation can change behind a port;
- API remains responsive under slow AI or import workloads.
