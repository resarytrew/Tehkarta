export type WorkspaceId = string;
export type UserId = string;
export type RequestId = string;

export interface RequestContext {
  requestId: RequestId;
  workspaceId: WorkspaceId;
  actorUserId: UserId;
  roles: readonly string[];
  permissions: readonly string[];
}

export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  generate(prefix?: string): string;
}

export interface Transaction {
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

export interface TransactionManager {
  begin(): Promise<Transaction>;
}

export interface ObjectRef {
  bucket: string;
  key: string;
  versionId?: string;
}

export interface PutObjectInput {
  key: string;
  body: Uint8Array;
  contentType?: string;
  metadata?: Readonly<Record<string, string>>;
}

export interface StoredObject extends ObjectRef {
  size: number;
  etag?: string;
}

export interface ObjectStore {
  put(input: PutObjectInput): Promise<StoredObject>;
  get(ref: ObjectRef): Promise<Uint8Array>;
  delete(ref: ObjectRef): Promise<void>;
  exists(ref: ObjectRef): Promise<boolean>;
  createTemporaryReadUrl(ref: ObjectRef, ttlSeconds: number): Promise<string>;
}

export type JobStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';

export interface JobEnvelope<TPayload = unknown> {
  jobId: string;
  workspaceId: WorkspaceId;
  type: string;
  schemaVersion: string;
  idempotencyKey: string;
  payload: TPayload;
  requestedAt: string;
}

export interface JobQueue {
  enqueue<TPayload>(job: JobEnvelope<TPayload>): Promise<void>;
}

export interface DomainEvent<TPayload = unknown> {
  eventId: string;
  eventType: string;
  schemaVersion: string;
  aggregateType: string;
  aggregateId: string;
  workspaceId: WorkspaceId;
  occurredAt: string;
  causationId?: string;
  correlationId?: string;
  payload: TPayload;
}

export interface EventPublisher {
  publish<TPayload>(event: DomainEvent<TPayload>): Promise<void>;
}

export interface AuditEntry<TPayload = unknown> {
  auditId: string;
  workspaceId: WorkspaceId;
  actorUserId?: UserId;
  action: string;
  resourceType: string;
  resourceId: string;
  occurredAt: string;
  requestId?: RequestId;
  payload?: TPayload;
}

export interface AuditSink {
  append<TPayload>(entry: AuditEntry<TPayload>): Promise<void>;
}

export interface FeatureFlagContext {
  workspaceId: WorkspaceId;
  userId?: UserId;
  attributes?: Readonly<Record<string, string | number | boolean>>;
}

export interface FeatureFlags {
  isEnabled(key: string, context: FeatureFlagContext): Promise<boolean>;
}

export interface SecretStore {
  getSecret(name: string): Promise<string>;
}

export interface CounterAttributes {
  readonly [key: string]: string | number | boolean;
}

export interface Telemetry {
  increment(name: string, value?: number, attributes?: CounterAttributes): void;
  timing(name: string, milliseconds: number, attributes?: CounterAttributes): void;
  recordError(error: unknown, attributes?: CounterAttributes): void;
}

export interface AuthorizationPolicy {
  can(context: RequestContext, action: string, resource: { type: string; workspaceId: WorkspaceId; ownerUserId?: UserId }): boolean | Promise<boolean>;
}

export interface OptimisticWriteOptions {
  expectedVersion: number;
}

export interface VersionedEntity {
  id: string;
  workspaceId: WorkspaceId;
  version: number;
}
