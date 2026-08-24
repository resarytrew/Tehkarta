# ADR 0009 — Versioned Methodology Packs and teacher-authoritative application

- **Status:** Accepted
- **Date:** 2026-08-24

## Context

Tehkarta needs to recommend teaching methods from approved lesson outcomes without turning methodology into opaque AI text or allowing recommendations to become authoritative automatically.

The product also needs a stable distinction between:

```text
Pedagogical Technology
→ Method
→ Technique
→ Organizational Form
```

Treating «group work» as a method, or allowing a model to invent this hierarchy on every request, would make lesson design inconsistent and difficult to validate.

## Decision

### 1. Methodology knowledge is stored in versioned Methodology Packs

A `MethodologyPack` contains:

- pack ID and version;
- pedagogical technology;
- canonical technology phases;
- method definitions;
- technique definitions;
- organizational forms;
- compatibility links;
- typical time ranges;
- preparation requirements;
- constraints;
- anti-patterns.

The first pack implements an inquiry/research technology.

### 2. Baseline recommendation is deterministic and explainable

The first recommendation engine is rule/compatibility based rather than an untraceable model call.

It consumes only `APPROVED` lesson outcomes. An approved problem question may be used as explanatory context but cannot replace the target outcome.

Examples:

- causal explanation → hypothesis testing;
- source/document work → source analysis;
- comparison → comparative method;
- data/statistics → statistical method;
- maps/spatial reasoning → cartographic method;
- modeling/system representation → modeling.

Every recommendation returns the target outcome, inferred outcome kinds, technology phase, method, rationale, time estimate, techniques, forms and constraints.

### 3. Recommendation is non-authoritative

A recommendation does not write to `lesson_decisions` by itself.

The teacher must explicitly choose `Использовать`.

Only then are selected values persisted as governed decisions with:

```text
source = TEACHER
status = APPROVED
```

The applied method, techniques and form therefore become authoritative because the teacher chose them, not because the recommendation engine produced them.

### 4. Method, Technique and Organizational Form are separate types

The system must not represent an organizational form as a method.

In particular:

> Group work is an organizational form, not a method.

The UI must present form selection separately from method and technique selection.

### 5. Teacher rejection is durable feedback

`Не использовать` is persisted in `lesson_methodology_feedback` with workspace, lesson, recommendation, pack/version, actor and time metadata.

Rejected recommendations are omitted for the same current recommendation identity instead of disappearing only from local UI state.

### 6. Recommendation identity is stable and router-safe

Recommendation IDs are deterministic for pack version + governed outcome identity/revision + method.

They must remain below normal HTTP router parameter limits. Full provenance must not be encoded into an arbitrarily long URL parameter; provenance remains available in structured recommendation fields and persistence metadata.

### 7. Applying methodology invalidates downstream artifacts

When a methodical configuration changes, dependent blocks are not silently regenerated.

Affected semantic areas include content, stages, materials, assessment, homework and final conclusion. They are marked stale through the existing dependency invalidation mechanism.

## Consequences

### Positive

- methodology is explainable and auditable;
- recommendation behavior can be regression-tested;
- teacher authority remains consistent with AI proposal governance;
- methods, techniques and forms cannot drift into one undifferentiated list;
- Methodology Packs can evolve/version independently from lesson state;
- future AI-assisted methodology suggestions can be layered on top without replacing the deterministic compatibility core.

### Trade-offs

- the first rule engine does not cover every nuanced pedagogical case;
- Methodology Packs require editorial/versioning discipline;
- changing pack semantics may change recommendations and therefore needs explicit version management;
- application and invalidation are currently coordinated by the modular-monolith use case rather than a distributed workflow.

## Rejected alternatives

### Let the LLM invent methods and forms for every lesson

Rejected because it is non-deterministic, hard to validate and encourages taxonomy errors.

### Auto-apply the top-ranked method

Rejected because it violates the product invariant that recommendations remain non-authoritative until the teacher explicitly decides.

### Store only one `methodology` text blob

Rejected because it prevents typed validation, compatibility checking, time constraints, independent form choice and downstream dependency tracking.
