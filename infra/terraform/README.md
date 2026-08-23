# Yandex Cloud infrastructure

Terraform is the source of truth for cloud infrastructure. No credentials or secret values are committed to Git.

Planned resources:

- VPC and subnets for `dev` and `prod`
- Container Registry
- Serverless Container for API
- Serverless Container for workers
- API Gateway
- Managed PostgreSQL with pgvector
- Object Storage buckets for web and private content
- Message Queue
- Lockbox secrets
- CDN / DNS / TLS
- Monium / OpenTelemetry integration

Deployment inputs such as `folder_id`, `cloud_id`, domains and service-account credentials must be supplied through CI secrets or local environment variables.
