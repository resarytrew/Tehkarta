# Architecture principles

These rules are intentional constraints for Tehkarta v3. They are more important than short-term implementation convenience.

## 1. Teacher authority is a system invariant

AI proposes; the teacher decides. Approved teacher decisions are immutable to downstream generation unless the teacher explicitly reopens them.

`PROPOSED -> EDITED -> APPROVED`

No generation step may silently replace `APPROVED` values.

## 2. Curriculum and licensed content are sources, not prompts

Working programs and UMK materials are versioned first-class domain data with provenance. The system must know which requirement, paragraph, page, edition, academic year and license a generated recommendation is based on.

## 3. Course -> section -> lesson, never isolated lesson by default

Lesson design receives context from the course and section: previous learning, next learning, progression of outcomes, mandatory content, assessment points and time budget.

## 4. Modular monolith first

We keep logical bounded contexts strict while deploying the initial product as a small number of processes (`api`, `worker`, `web`, `admin`). We do not create microservices until independent scaling, ownership or failure isolation justifies them.

## 5. Hexagonal boundaries

Domain and application code do not depend directly on Yandex Cloud SDKs, OpenRouter, a specific database client or an AI vendor. Infrastructure is connected through ports/adapters.

## 6. PostgreSQL is authoritative

Persistent business state lives in PostgreSQL. Object Storage stores files and large artifacts. Queue messages are delivery mechanisms, not the source of truth.

## 7. Async by design

Long AI generations, document parsing, OCR, embeddings, exports and bulk validation are jobs with durable IDs, idempotency keys, retry policy and resumable status.

## 8. Version everything that can affect pedagogy

At minimum: curriculum packs, UMK packs, prompts, methodology packs, model routing policies, lesson revisions, validation rules and exported documents.

A historical lesson must remain reproducible even after the platform changes.

## 9. Provenance everywhere

Every important piece of generated or retrieved content must be attributable to one or more origins: curriculum, textbook/UMK, teacher, AI, external source, system rule.

## 10. Multi-tenant-ready from day one

Business data belongs to a workspace. Today a workspace may represent one teacher; later it may represent a school, department or team. Authorization is always evaluated inside workspace context.

## 11. Optimistic concurrency and auditability

Teacher collaboration and multi-tab editing are expected future requirements. Aggregate versions and audit events must prevent silent lost updates.

## 12. Privacy boundary

Educational content and personal data are separate concerns. We minimize personal data in AI prompts and logs. Sensitive payloads must never be required for observability.

## 13. Deterministic checks before LLM checks

Time arithmetic, missing approvals, duplicate coverage, version mismatches, dependency invalidation and schema consistency are deterministic rules. LLM review is used only where semantic judgment is actually needed.

## 14. AI is routed by task

No single model is the architecture. Model choice is policy. Every AI call records task type, provider, model, prompt version, latency, token/cost data when available, and result status.

## 15. Cloud portability at the code boundary

Yandex Cloud is the deployment target, but business logic must not be coupled to vendor SDKs. Object storage, queues, secrets and telemetry are ports with Yandex adapters.

## 16. Expand-contract migrations

Production schema changes are backwards-compatible across a deployment window. Destructive migrations require an explicit cleanup phase after the new code is active.

## 17. Feature flags for risky product changes

New generation flows, model policies, validators and course-planning algorithms should be releasable behind flags and measurable against benchmark fixtures.

## 18. Benchmark-driven AI development

The two existing lesson experiments become the beginning of a permanent evaluation suite. Prompt or model changes are not accepted solely because one example looks better.
