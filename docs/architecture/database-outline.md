# PostgreSQL outline

This is a logical schema outline, not a commitment to a specific TypeScript ORM.

## Identity / workspace

- `users`
- `workspaces`
- `memberships`
- `sessions`
- `invitations` (later)

## Curriculum

- `curriculum_packs`
- `curriculum_courses`
- `curriculum_sections`
- `curriculum_requirements`
- `curriculum_requirement_sources`

Published rows are immutable by logical version.

## Content library / UMK

- `content_packs`
- `content_sources`
- `source_documents`
- `source_sections`
- `source_fragments`
- `source_assets`
- `content_mappings`

Embeddings/vector fields belong to retrieval-oriented tables and reference stable source fragments.

## Pedagogy

- `methodology_packs`
- `methodology_phases`
- `methods`
- `techniques`
- `organizational_forms`
- `methodology_rules`

## Course planning

- `courses`
- `course_sections`
- `planned_lessons`
- `requirement_allocations`
- `outcome_progressions`

## Lesson design

- `lessons`
- `lesson_revisions`
- `lesson_decisions`
- `lesson_dependency_edges`
- `lesson_stages`
- `lesson_materials`
- `lesson_assessments`
- `validation_reports`

`lesson_decisions` stores stable semantic fields (goal/problem/outcome/method/etc.) with source, status and revision rather than hiding all teacher authority inside one opaque plan JSON blob.

Structured JSONB is still acceptable for bounded payloads whose internal shape is versioned and validated.

## AI / jobs

- `async_jobs`
- `ai_invocations`
- `ai_invocation_attempts`
- `prompt_templates`
- `prompt_versions`
- `routing_policy_versions`

Large prompt/response payload retention is optional and separated from required invocation metadata.

## Audit / artifacts

- `audit_events`
- `export_artifacts`
- `object_references`

## Database rules

1. Every workspace-owned table has `workspace_id` and indexes that support tenant-scoped queries.
2. Foreign keys are used for internal integrity where lifecycle boundaries permit.
3. Business aggregates have integer `version` for optimistic concurrency.
4. Timestamps are stored in UTC.
5. Hard deletes are exceptional; archival/status transitions are preferred.
6. Public IDs are non-sequential opaque IDs even if internal surrogate keys are introduced later.
7. Search/vector indexes are projections and can be rebuilt from authoritative source data.
8. Queue payloads contain references/IDs; PostgreSQL stores durable job state.

## Migration strategy

Use one canonical migration history for the product database. Deploy with expand-contract changes:

1. add compatible schema;
2. deploy code that writes/reads new schema;
3. backfill if required;
4. switch reads;
5. remove obsolete schema in a later deployment.

The specific migration library will be chosen before the first persistent schema is committed and recorded in a separate ADR.
