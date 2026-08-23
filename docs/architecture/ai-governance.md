# AI governance

AI is a replaceable capability, not the source of truth.

## Invocation envelope

Every AI request is represented by a durable logical envelope:

```ts
interface AIInvocation {
  invocationId: string;
  workspaceId: string;
  taskType: string;
  aggregateRef?: string;
  inputSchemaVersion: string;
  promptTemplateId: string;
  promptVersion: string;
  routingPolicyVersion: string;
  provider?: string;
  model?: string;
  requestedAt: string;
  idempotencyKey: string;
}
```

The resulting metadata records status, latency, provider/model, token usage/cost when available, retries and output schema version.

## Prompt registry

Prompts are named, versioned assets. Production prompt changes are never silent edits to a string embedded in a component.

Each prompt has:

- stable ID;
- semantic version/revision;
- task type;
- input schema version;
- output schema version;
- applicable design modes;
- benchmark suite;
- change notes.

## Structured output first

AI generates structured domain proposals. UI prose is derived from typed outputs where possible.

Bad:

```text
"Here is a beautiful complete lesson..."
```

Preferred:

```json
{
  "problemQuestion": {"value": "...", "rationale": "..."},
  "alternatives": [],
  "evidenceRefs": []
}
```

## Provider routing

`AIProvider` remains vendor-neutral. Routing policy decides which provider/model serves each task.

Examples:

- simple rewrite: fast/low-cost model;
- methodology recommendation: stronger reasoning model;
- final semantic review: strong model;
- deterministic validation: no model.

A provider outage must not corrupt lesson state. Failed generations remain failed proposals/jobs.

## Approved-state contract

The generation input is an `ApprovedLessonContext` plus explicit source evidence and task-specific draft data. The model does not receive an unbounded conversational transcript as the authoritative state.

## Creative mode

Creative mode may loosen reliance on textbook structure, but it does not waive mandatory curriculum coverage, source provenance, factual validation or teacher approval.

## Evaluation gates

Changes to prompts, routing policies and major model versions are evaluated against benchmark fixtures before broad release.

Core metrics include:

- teacher-decision preservation;
- curriculum coverage;
- UMK fidelity by selected design mode;
- methodology fidelity;
- time feasibility;
- factual/source integrity;
- duplication across lessons;
- structured-output validity;
- latency and cost.

## Logging policy

Operational metadata is logged by default. Full prompt/response payload retention is configurable and minimized, especially when user-provided or personal data may be present.

Do not require sensitive text to diagnose infrastructure failures.
