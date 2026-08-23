# Bounded contexts

Tehkarta is a modular monolith at the product core. Modules are separated by domain responsibility, not by deployment unit.

## Core contexts

### Identity & Workspace
Owns users, workspaces, memberships, roles, invitations and authorization context.

Must not own pedagogical data.

### Curriculum
Owns working programs, academic-year applicability, mandatory content, planned hours, normative outcomes and curriculum mappings.

### Content Library
Owns UMK packs and other instructional sources: textbooks, method guides, atlases, workbooks, assessments, digital materials, licensing metadata, parsed structure and source provenance.

### Pedagogy
Owns methodology packs: pedagogical technologies, methods, techniques, forms of organization, applicability constraints, anti-patterns and quality criteria.

### Course Planning
Owns course/section structure, sequencing, learning progression, coverage matrices and allocation of curriculum requirements to lessons.

### Lesson Design
Owns teacher-controlled lesson intent, approved decisions, dependency graph, lesson stages, tasks, materials and revisions.

### Generation
Owns AI task orchestration, prompt registry/versioning, provider/model routing, generation jobs and structured outputs. It must not become the owner of lesson truth.

### Retrieval
Owns document parsing, chunk/structure indexing, embeddings, retrieval policies and evidence bundles. Retrieval returns evidence; it does not decide pedagogy.

### Validation
Owns deterministic and semantic validation reports: curriculum coverage, UMK coverage, methodology fidelity, timing, consistency, difficulty, evidence and course progression.

### Export
Owns reproducible document rendering, print layouts and export artifacts. It consumes approved state and must not rewrite pedagogical decisions.

### Audit & Observability
Owns immutable audit events, operational telemetry, AI invocation metadata and diagnostics. It must avoid storing unnecessary sensitive payloads.

## Supporting contexts reserved for later

- Collaboration: comments, review workflows, co-authoring.
- Assessment: reusable assessment item bank and learning evidence.
- Analytics: aggregated product and pedagogical analytics.
- Billing/Entitlements: subscriptions, quotas and organization plans.
- Integrations: LMS, SSO, external storage and government/education APIs where legally and technically appropriate.

## Dependency direction

The intended dependency flow is:

```text
apps/*
  -> application/use-cases
      -> domain
      -> ports

adapters/*
  -> ports
  -> vendor SDK/client
```

Domain code must never import infrastructure adapters.

## Cross-context communication

Prefer explicit application commands/queries and domain events over direct table access across modules.

Examples:

- `CurriculumPackPublished`
- `ContentPackVersionPublished`
- `LessonDecisionApproved`
- `LessonDependenciesInvalidated`
- `GenerationJobRequested`
- `GenerationJobCompleted`
- `ValidationCompleted`

Events are versioned contracts. Consumers must tolerate additive fields.

## Extraction rule

A bounded context becomes an independent service only when at least one of these is true:

1. it requires materially different scaling;
2. it needs failure isolation;
3. it has an independent release/ownership lifecycle;
4. security boundaries require it;
5. data volume/latency characteristics make process separation necessary.

Until then, keeping it inside the modular monolith is preferred.
