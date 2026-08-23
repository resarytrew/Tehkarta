# ADR 0006: Vendor services behind ports/adapters

- Status: Accepted
- Date: 2026-08-23

## Context

Yandex Cloud is the deployment target and multiple AI providers may be used over time. Coupling domain/application code to cloud or model SDKs would make testing and future migration expensive.

## Decision

External capabilities are represented by narrow ports. Initial examples:

- `ObjectStore`
- `JobQueue`
- `SecretStore`
- `Telemetry`
- `Clock`
- `IdGenerator`
- `AuditSink`
- `FeatureFlags`
- `AIProvider`

Yandex Cloud, OpenRouter and other vendors are adapters implementing these contracts.

## Consequences

- Yandex Cloud remains first-class without becoming business logic;
- unit tests can use in-memory adapters;
- providers can be replaced or dual-run;
- adapter code must translate vendor-specific errors into stable application errors.
