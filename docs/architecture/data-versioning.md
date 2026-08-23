# Data, versioning and reproducibility

## Business aggregates

Every persisted business aggregate should carry:

```ts
id: string
workspaceId: string
version: number
createdAt: string
updatedAt: string
createdBy: string
updatedBy: string
archivedAt?: string
```

`version` is used for optimistic concurrency. Updates must fail when the caller writes against a stale aggregate version.

## Published reference packs

Curriculum and UMK content are immutable once published. Corrections create a new version.

```text
CurriculumPack
  logicalId
  version
  academicYear
  status: DRAFT | PUBLISHED | RETIRED
  effectiveFrom
  effectiveTo?

ContentPack
  logicalId
  version
  academicYear
  status
  licenseRef
```

Lessons keep the exact pack/version references they were designed against.

## Source provenance

A source-backed record must be traceable to the original document location where possible:

```ts
interface SourceRef {
  sourceId: string;
  sourceVersion: string;
  sourceType: 'CURRICULUM' | 'TEXTBOOK' | 'METHOD_GUIDE' | 'ATLAS' | 'ASSESSMENT' | 'EXTERNAL';
  documentTitle: string;
  section?: string;
  pageStart?: number;
  pageEnd?: number;
  fragmentHash?: string;
}
```

`fragmentHash` lets us detect when a re-import changed source text even if a human-readable label stayed the same.

## Lesson revision model

Do not overwrite the historical lesson snapshot.

```text
Lesson (identity/current pointers)
  -> LessonRevision 1
  -> LessonRevision 2
  -> LessonRevision 3 (current)
```

Each revision records:

- parent revision;
- actor;
- reason;
- changed governed fields;
- source pack versions;
- prompt/model policy versions used by generated fields;
- validation report version.

## Governed field model

Teacher-controlled fields have stable identities rather than existing only as free JSON paths.

```ts
GovernedField<T> {
  fieldId
  value
  source
  status
  revision
  approvedBy?
  approvedAt?
}
```

Once approved, a downstream generation may reference the field but may not replace it.

## Dependency graph

Dependencies are explicit edges:

```text
problemQuestion -> hypotheses
problemQuestion -> contentPlan
outcomes -> methods
methods -> stages
contentPlan -> materials
stages -> timingValidation
```

A parent change marks descendants `STALE`; it does not destroy them. This lets the teacher compare old and regenerated variants.

## Export reproducibility

Every export references a frozen lesson revision and renderer version:

```text
ExportArtifact
  lessonRevisionId
  rendererVersion
  templateVersion
  generatedAt
  objectStorageKey
  checksum
```

Re-exporting an old revision must not silently use current mutable lesson state.

## Deletion policy

Prefer archival and retention rules for authored educational records. Hard deletion is reserved for legal/privacy requirements and administrator-controlled cleanup workflows.
