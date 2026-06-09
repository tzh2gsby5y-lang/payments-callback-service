# Decisions

## Persistence choice

The project uses TypeORM because the intended developer workflow is TypeORM-first. Runtime
persistence is PostgreSQL with TypeORM entities and repositories.

The project is entity-first: TypeORM entities are the schema source and migrations should be
generated from them with `npm run migration:generate`. The checked-in migrations are the baseline
that mirrors the current entities.

For MVP speed, local runs can use `DB_SYNCHRONIZE=true`. Production-like runs should use
`DB_SYNCHRONIZE=false` and `npm run migration:run`.

Indexes are intentionally selective:

- `(brandId, email)` unique for tenant-scoped login/registration
- `tokenHash` unique for session lookup
- `(brandId, userId)` for tenant-scoped profile/session analysis
- `expiresAt` for session cleanup
- `(brandId, source, provider, status, receivedAt)` for callback processor/reconciliation scans
- `(brandId, source, provider, providerEventId)` for provider-event lookup/audit
- `(brandId, source, provider, key)` unique for idempotency claims
- `(brandId, source, provider, status, createdAt)` for retry/monitoring queues
- `(brandId, source, provider, idempotencyKey)` unique for accepted PSP provider-event handoffs
- `(status, nextAttemptAt, createdAt)` for future PSP handoff evaluator scans
- `(brandId, source, provider, idempotencyKey)` unique for GSP wallet intents
- `ledgerCommandId` unique for durable GSP ledger-port commands
- `(status, nextAttemptAt, createdAt)` for future GSP wallet retry/reconciliation scans

The MVP avoids indexing every payload attribute because webhook ingestion is write-heavy. The
status/listing indexes are included because raw event ingestion normally gets a near-term processor
or reconciliation view; if those reads do not materialize, they should be removed before production
traffic.

`sessions.userId` and `idempotency_keys.rawEventId` use foreign keys because these rows live inside
the same persistence boundary in this MVP. Cross-service ledger relationships are deliberately not
modeled as foreign keys.

## DDD-friendly, not ceremony-heavy DDD

Each main context is split into:

- `domain`: local domain types and states
- `application`: explicit use-cases and ports
- `infrastructure`: TypeORM repositories, transactional stores, provider adapters
- `presentation`: controllers, DTOs, guards

The code intentionally avoids heavy aggregate/value-object ceremony. The goal is clear module
boundaries and testable use-cases.

`callbacks` is deliberately not a top-level domain module. A callback/webhook is a transport event,
not a business capability by itself. The top-level provider capabilities are `psp` and `gsp`.
Provider submodules such as Stripe and Pragmatic contain provider-specific verification,
normalization, and response mapping/idempotency inputs.

`shared/provider-events` contains shared-kernel contracts only: provider-event types, provider
adapter ports, idempotency strategy contracts, and handoff state types. The raw-event/idempotency
entities remain source-aware because both PSP and GSP write inbound audit records.

`modules/provider-events` is a technical infrastructure/application module, not a business
capability. It owns the PSP durable ingestion implementation: raw event repository contracts and
TypeORM bindings, idempotency claim flow, provider-event handoff flow, provider registries, and
`ProviderCallbackIngestionService`. The store/service input is intentionally PSP-only so GSP cannot
accidentally fall back to the old async handoff path.

PSP/GSP modules import some provider-events application tokens directly instead of going through a
separate public package facade. That keeps the MVP small. If the module grows, the next cleanup
should be a narrow provider-ingestion public API that exports only the registration tokens and
ingestion service contract.

PSP and GSP modules own their HTTP webhook controllers and source-specific use-cases.
`IngestPspCallbackUseCase` calls the technical `modules/provider-events` ingestion service with the
fixed PSP source. `ExecuteGspWalletActionUseCase` is separate: it uses a GSP provider registry,
wallet-intent store, and ledger port. That keeps PSP async notifications and GSP synchronous wallet
actions from sharing the wrong state machine.

## Identity and tenant isolation

Users are scoped by `brandId`. The unique user key is `(brandId, email)`, so the same email can
exist in separate brands. Sessions store `brandId`, and `GET /profile/me` rejects a request when
the session brand does not match `x-brand-id`.

Repository methods for tenant-owned reads require `brandId`, for example `findByIdForBrand`.

Provider callbacks also persist `brandId` and scope idempotency, raw events, PSP handoffs, and GSP
wallet intents by it.
For this MVP, Stripe-like and Pragmatic-like callbacks derive `brandId` from the verified provider
payload. A production integration should usually bind tenant context to provider account
configuration, webhook secret, or a tenant-specific route as well, then reject payloads whose
embedded tenant disagrees with that binding.

## Provider adapters

Stripe and Pragmatic are modeled as provider modules with adapter classes. They are
responsible for:

- signature verification or a clear verification placeholder
- provider-specific payload validation
- normalization to the owning module's application contract
- provider-facing response serialization where the provider expects a synchronous business response

They are not responsible for balance updates or ledger writes.

## PSP/GSP callback scope

The PSP and GSP modules are intentionally separate business-facing entrypoints with different
callback semantics.

PSP matches the usual asynchronous payment-notification model: verify the provider request,
normalize it, persist `raw_events`, claim idempotency, and create a durable
`provider_event_handoffs` row for later evaluation.

GSP is modeled as synchronous wallet handling because a game provider commonly waits for an
immediate business answer. The Pragmatic-like path verifies the request, normalizes it to a wallet
action, persists `raw_events`, claims idempotency, creates a `gsp_wallet_intents` record, calls the
ledger port, stores the response, and returns `200 OK` with the provider-facing wallet result.

The included ledger implementation is a deterministic local adapter behind `GSP_LEDGER_PORT`. It is
present so reviewers can execute and test a realistic synchronous flow. It is not a production
Ledger, and replacing it with a service client or message-backed adapter should not require
changing the provider adapter.

## Provider event handoffs

Accepted PSP callbacks create a `provider_event_handoffs` row in the same transactional persistence
boundary as the idempotency claim and raw-event status update. This row is an outbox-style work
record for a future evaluator; it is not a Ledger entry, wallet authorization, balance mutation, or
proof that a ledger command was dispatched.

The initial handoff status is `PENDING_EVALUATION`. A future evaluator can map a handoff to one of
the real downstream outcomes: ledger command, no-op, conflict, or manual review. That evaluator is
where a separate `ledger_intents` table or same-database Ledger transaction should be introduced.

This extra boundary lets PSP remain asynchronous and durable without calling external Ledger from
the webhook request path. GSP does not create provider-event handoffs; it uses
`gsp_wallet_intents` because the provider expects the result of the wallet action in the HTTP
response.

## Raw events as the durable ingestion boundary

Verified and normalized callback attempts are persisted to `raw_events`. This preserves the original
provider payload for audit, reconciliation, and future processors.

The assignment wording says callback events can be saved to `raw_events` "or outbox-like table".
For an incoming webhook, the precise pattern is inbox-like: the event is entering this service and
must be durably recorded before downstream effects. The separate `provider_event_handoffs` table is
the PSP outbox-style boundary used after acceptance. The `gsp_wallet_intents` table is a durable
GSP intent record for synchronous ledger-port interaction.

Current raw event states:

- `RECEIVED`
- `ACCEPTED`
- `DUPLICATE`
- `CONFLICT`
- `COMPLETED`
- `FAILED_RETRYABLE`
- `FAILED_FINAL`

Invalid signatures and malformed provider payloads are rejected before `raw_events` insertion
because `raw_events` is modeled as the durable boundary for normalized provider events. A production
audit trail should persist rejected attempts too, but in a separate `webhook_attempts` or
`callback_attempts` table with nullable tenant/provider fields and reject reasons. Keeping
`raw_events` strict avoids synthetic idempotency keys and nullable normalized fields.

## Idempotency

Idempotency is enforced through `idempotency_keys` with unique scope:

```text
(brandId, source, provider, key)
```

The idempotency record also stores a provider-specific semantic fingerprint hash. A repeated
callback with the same provider key and the same stable financial meaning is acknowledged as a
duplicate, even if retry-only fields such as timestamps differ. A repeated key with a different
semantic fingerprint returns `409`.

Stripe uses `event.id` for delivery-level dedupe and fingerprints stable fields including
`event.type`, `data.object.id`, amount, currency, and player metadata. Pragmatic-style GSP wallet
actions use provider-owned `reference`/`transactionId` plus `action`; the fingerprint includes
stable financial fields and excludes timestamp, signature, and retry request ids.

This prevents accidental double-processing if providers retry webhooks.

## No direct balance updates

Provider adapters do not update balances. They verify, validate, normalize, and serialize
provider-facing responses.

PSP callbacks do not call Ledger in the request path. Accepted PSP callbacks create
`provider_event_handoffs` only; a future evaluator should map those facts into ledger commands,
no-ops, conflicts, or manual review.

GSP wallet callbacks call the ledger port from the GSP application use-case because the provider
expects a synchronous business answer. The current port implementation is a local adapter for MVP
demonstration. In production this port should be backed by a real Ledger service or by durable
ledger-command/outbox rows with a clear synchronous response strategy.

`raw_events` is the inbound inbox: it records verified provider facts/actions that can be replayed
or reconciled. `provider_event_handoffs` is the PSP durable processing boundary. `gsp_wallet_intents`
is the GSP durable wallet/ledger intent boundary.

## Saga and state machines

The MVP contains small durable state machines for raw callback events and GSP wallet intents. A
full saga orchestrator is not implemented because PSP settlement and multi-step game-round
workflows are still outside this MVP.

Future saga/process-manager candidates:

- PSP deposit: received -> authorized -> captured -> ledger posted -> settled
- PSP withdrawal: requested -> provider pending -> approved/rejected -> ledger posted
- GSP game round: wallet intent received -> ledger in flight -> approved/declined -> response cached
- GSP rollback: original event found -> compensation intent -> ledger compensation posted -> response cached

Saga state should be durable and idempotent, not held in memory.

## Signature verification

If webhook secrets are not configured, signature verification is marked as skipped for local
developer flow. In production, secrets are required by config validation and adapters fail closed if
a required secret is missing. If secrets are configured, Stripe-like and Pragmatic-like HMAC checks
are enforced.

Real integrations should use each provider's official verification library or exact protocol.

## Testing strategy

Unit tests use local fakes scoped to individual specs. HTTP and TypeORM integration tests use the
same database-backed providers as runtime, which keeps the callback/idempotency path honest.

Covered areas:

- unit test for identity business logic
- unit tests for provider-event ingestion idempotency and conflict behavior
- integration tests for PSP duplicate provider-event handling
- integration tests for GSP synchronous wallet duplicate replay, conflicts, declined bets, rollback,
  and no-handoff guarantees
- concurrent PSP duplicate callback test backed by PostgreSQL
- integration test for tenant leakage prevention
- integration test that same GSP provider transaction ids are isolated by `brandId`
- webhook payload contract tests for Stripe-like and Pragmatic-like schemas
- adapter tests for provider signature verification and production fail-closed behavior
- HTTP test for signed Stripe-like callback raw-body verification

Remaining test gap: there is no real external Ledger contract test. The GSP suite uses the local
ledger-port mock to prove synchronous orchestration and idempotency; a production Ledger adapter
should add contract tests around its request/response schema and retry semantics.

## OpenAPI

Swagger/OpenAPI is exposed by the running Nest app at `/docs`.

OpenAPI metadata is intentionally controller/DTO-first, using `@nestjs/swagger` decorators such as
`@ApiProperty`, `@ApiBody`, `@ApiOkResponse`, and `@ApiAcceptedResponse`. PSP exposes `202 Accepted`
with `ProviderWebhookResponseDto`; GSP exposes `200 OK` with `GspWalletResponseDto` and no handoff
response. Provider webhook request and response shapes are represented by docs-only DTO classes.
The only small schema fragment left in a controller is the Pragmatic-like `anyOf` event-identity
constraint, expressed with `getSchemaPath(PragmaticWebhookPayloadDto)` so the field schema still
comes from the DTO.
