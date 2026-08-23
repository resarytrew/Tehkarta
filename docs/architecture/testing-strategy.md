# Testing and evaluation strategy

## Layers

### 1. Pure domain tests

Fast tests for invariants and deterministic logic:

- approved fields cannot be silently replaced by AI;
- dependency traversal marks descendants stale;
- course/section hour arithmetic;
- outcome/content coverage calculations;
- difficulty ordering rules;
- version/conflict behavior.

### 2. Application use-case tests

Use in-memory ports/adapters to test authorization, idempotency, optimistic writes, domain events and orchestration without network services.

### 3. Adapter contract tests

Each PostgreSQL/Object Storage/Queue/AI adapter is tested against the same port expectations. In-memory adapters are not accepted as proof that a real adapter behaves correctly.

### 4. Integration tests

Test database migrations, repository queries, job lifecycle and retrieval pipelines against disposable infrastructure where practical.

### 5. API tests

Verify stable error codes, auth/workspace isolation, version conflicts, idempotency and async job responses.

### 6. Browser tests

Cover the high-value teacher journey, not every visual state:

course -> section -> lesson -> edit -> Apply -> variants -> approve -> downstream generation -> export.

### 7. AI benchmark/evals

AI quality is not judged by unit tests alone. Maintain versioned benchmark fixtures containing:

- source curriculum/UMK context;
- approved teacher decisions;
- expected invariants;
- expected coverage bands;
- known anti-patterns;
- qualitative rubric.

The existing two “Экономика делает решающий рывок” experiments are initial fixtures.

## Merge gates

Foundation target:

1. typecheck passes;
2. build passes;
3. deterministic tests pass;
4. no new architecture-boundary violations;
5. later: database migration check;
6. later: benchmark smoke evaluation for prompt/model changes.

## Production confidence

A model/prompt change may pass technical CI and still be blocked from default release by benchmark regression. AI quality and software correctness are separate release dimensions.
