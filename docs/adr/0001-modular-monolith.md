# ADR 0001: Modular monolith with extractable boundaries

- Status: Accepted
- Date: 2026-08-23

## Context

Tehkarta has many logical domains (curriculum, UMK, pedagogy, course planning, lesson design, generation, retrieval, validation) but the initial team and traffic do not justify distributed-service complexity.

## Decision

Build a modular monolith with strict package/context boundaries and deploy a small number of stateless processes:

- `web`
- `admin`
- `api`
- `worker`

Domain/application modules communicate through typed interfaces and domain events. Vendor-specific infrastructure remains behind adapters.

## Consequences

Positive:

- fast development and simpler operations;
- one transactional database where useful;
- clear future extraction path;
- less network and deployment complexity.

Negative:

- package boundaries require discipline;
- independent scaling is limited until a context is extracted.

## Extraction trigger

A module becomes a service only when scaling, ownership, failure isolation, security or data characteristics justify it.
