# ADR 0004: Approved state and explicit dependency invalidation

- Status: Accepted
- Date: 2026-08-23

## Context

A previous prototype allowed an edited teacher problem question to be replaced later by stale AI state. This is unacceptable for a teacher-authoring product.

## Decision

Teacher-controlled semantic fields use governed state (`PROPOSED`, `EDITED`, `APPROVED`). Downstream generation consumes approved values only.

Dependencies between design decisions are represented explicitly. Changing an approved parent decision creates a new revision and marks dependent artifacts `STALE`; it does not silently regenerate or delete them.

The teacher chooses whether to regenerate affected descendants.

## Consequences

- teacher authority is enforceable in code;
- the UI can explain what a change affects;
- partial regeneration becomes safe;
- we must maintain dependency rules as the lesson model evolves.
