# API contract conventions

The public web/admin clients talk to a versioned HTTP API. Internal module interfaces remain TypeScript/application contracts.

## Versioning

Initial routes use `/api/v1/...`.

Breaking API changes create a new major route version. Additive response fields do not require a new version.

## Request context

Every request receives a server-generated `requestId` and authenticated workspace context.

Clients never become trusted merely because they send `workspaceId`.

## Optimistic concurrency

Mutating aggregate endpoints require an expected version. The exact transport may be an `If-Match` header or explicit field, but the application command always receives `expectedVersion`.

Stale writes return a conflict rather than silently overwriting newer teacher work.

## Idempotency

Operations that may be retried safely (generation start, import start, export start, payment later) accept an idempotency key.

Repeated requests with the same key return the existing operation/result instead of starting duplicate work.

## Stable error envelope

```json
{
  "error": {
    "code": "STALE_VERSION",
    "message": "The lesson changed since it was loaded.",
    "requestId": "req_...",
    "details": {}
  }
}
```

UI behavior depends on stable error codes, not string matching.

## Async operation response

Long operations return a job resource:

```json
{
  "jobId": "job_...",
  "status": "QUEUED",
  "statusUrl": "/api/v1/jobs/job_..."
}
```

## Pagination

Cursor pagination is the default for growing collections. Offset pagination is allowed only for small static/admin lists.

## Source references

API payloads that expose generated content may include evidence/source references by stable IDs. The client can resolve human-readable provenance separately rather than duplicating source blobs in every response.

## Compatibility

Clients must tolerate additive fields and unknown enum values where feasible. Server-side schemas remain stricter for incoming commands.
