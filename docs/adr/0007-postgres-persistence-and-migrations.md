# ADR 0007: PostgreSQL persistence and migrations

Status: accepted

## Context

Tehkarta needs a durable source of truth for identity, workspaces, course planning, teacher-approved decisions, versioned curriculum/UMK references, asynchronous jobs and AI traceability. The product is expected to evolve for years, so persistence must remain understandable without coupling the domain model to one ORM.

## Decision

1. PostgreSQL is the authoritative transactional store.
2. Schema changes are explicit numbered SQL migrations under `packages/database/migrations`.
3. A small migration runner applies migrations under a PostgreSQL advisory lock, records checksums, and rejects edits to already-applied migration files.
4. Repository adapters use parameterized SQL through `pg` behind application repository contracts.
5. Workspace scoping is mandatory in repository queries for workspace-owned data.
6. Aggregate writes use integer optimistic versions.
7. Current teacher decisions and immutable decision revisions are stored separately.
8. Database constraints and triggers may enforce critical invariants when application-only enforcement would be insufficient. The first such invariant prevents AI-originated updates from overwriting an already approved teacher decision.
9. Search indexes, vector embeddings, caches and queues remain derived projections; PostgreSQL stores the durable state needed to rebuild them.
10. Migrations follow expand-contract. Applied migration files are immutable.

## Why not an ORM-first schema

The domain includes versioned regulatory content, provenance, multi-tenancy, immutable revisions and long-lived migrations. We prefer SQL as the durable schema contract. A query builder may be introduced later if repository complexity warrants it, without changing migration ownership.

## Consequences

- SQL remains reviewable and portable to Yandex Managed PostgreSQL.
- Repository code is explicit and easy to profile.
- More mapping code is required at adapter boundaries.
- Integration tests against a real PostgreSQL service are mandatory in CI.
- `pgvector` will be introduced in a separate retrieval migration so the transactional core is not coupled to vector indexing concerns.
