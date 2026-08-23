# ADR 0002: Workspace-scoped tenancy from day one

- Status: Accepted
- Date: 2026-08-23

## Context

The first users may be individual teachers, but the product is expected to support schools, departments, teams and collaborative authoring later.

Adding tenant boundaries after launch is expensive and risky.

## Decision

Every business aggregate is scoped by `workspaceId`. Users interact through memberships and permissions. Repository/application APIs always operate inside explicit workspace context.

The first release may expose only a personal workspace UX, but the data model and authorization contracts are tenant-aware.

## Consequences

Positive:

- future school/team support does not require rewriting every table;
- clearer authorization rules;
- safer sharing/collaboration features later.

Cost:

- slightly more ceremony in repositories, commands and tests now.
