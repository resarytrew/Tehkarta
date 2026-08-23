# ADR 0003: Versioned curriculum/UMK packs with provenance

- Status: Accepted
- Date: 2026-08-23

## Context

Curricula and instructional materials change by academic year, edition and publication. AI-generated pedagogy must remain explainable and reproducible.

## Decision

Curriculum packs and content packs are immutable after publication. Corrections create new versions. Every lesson revision stores the exact pack versions used.

Extracted content keeps source provenance down to document/section/page where available and may include a fragment hash.

## Consequences

- old lessons can be reproduced and audited;
- new academic-year packs can coexist with historical packs;
- retrieval can cite exact origins;
- import/admin tooling must support draft -> publish -> retire lifecycle.
