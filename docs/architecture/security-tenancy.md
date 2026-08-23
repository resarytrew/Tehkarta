# Security and tenancy

Tehkarta is designed as a multi-tenant product even if the first release is used by individual teachers.

## Workspace boundary

Every business record belongs to a `workspaceId`.

A workspace may later represent:

- one teacher;
- a school;
- a department/methodological association;
- a project team.

No repository query may rely on a client-supplied object ID alone. Authorization must validate workspace membership and permission for the requested operation.

## Principal model

```ts
interface Principal {
  userId: string;
  workspaceId: string;
  membershipId: string;
  roles: string[];
  permissions: string[];
}
```

Initial roles can be small (`OWNER`, `ADMIN`, `TEACHER`, `VIEWER`) while permissions remain granular enough for future collaboration.

## Separation of identities and educational content

Identity/profile tables should be separate from curriculum, UMK and lesson content tables. This limits accidental propagation of personal data into retrieval indexes and AI prompts.

## Authorization location

Authorization is enforced in application use cases/API handlers, not only in the UI. Infrastructure adapters must not bypass tenant filters.

## Service identities

API, worker, import pipeline and deployment automation use separate service identities with least-privilege permissions.

Examples:

- API can read/write application DB and create queue jobs;
- worker can consume jobs and write job results;
- content importer can access source buckets and indexing resources;
- CI/CD can deploy but does not need access to application data.

## Secrets

No application secret belongs in Git, frontend bundles or database rows intended for business data. Secrets are referenced through the secrets port and supplied by the deployment environment.

## Audit

Security-relevant events are immutable audit events:

- login/session changes;
- membership/role changes;
- content pack publication;
- lesson approval/reopen;
- export publication;
- administrative changes to curriculum/UMK sources.

## Signed/private files

UMK and user files are private by default. Public bucket URLs are not part of the domain model. Access should use controlled download endpoints or short-lived signed access where appropriate.

## Data retention

Retention classes are defined per data category rather than globally:

- authentication/session data;
- audit events;
- lesson revisions;
- imported source documents;
- generated temporary artifacts;
- operational telemetry.

## Future student data

The architecture must not assume that student PII is required for lesson design. If student accounts or assessment analytics are introduced later, they belong to an explicit privacy-reviewed bounded context rather than being added casually to lesson-generation payloads.
