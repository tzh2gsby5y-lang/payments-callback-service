# PSP Callback + GSP Wallet MVP

Small NestJS + TypeScript backend that demonstrates identity basics, safe PSP callback ingestion,
synchronous GSP wallet actions, idempotency, tenant isolation with `brandId`, and readiness for a
future real Ledger service.

## What is included

- `POST /auth/register`
- `POST /auth/login`
- `GET /profile/me`
- `POST /webhooks/psp/:provider`
- `POST /webhooks/gsp/:provider`
- TypeORM + PostgreSQL persistence
- `users`, `sessions`, `raw_events`, `idempotency_keys`, `provider_event_handoffs`,
  `gsp_wallet_intents`
- request/correlation id in responses and logs
- structured error responses
- Swagger/OpenAPI UI served by the running app at `/docs`
- unit and integration tests

## Local run

The simplest path is Docker:

```bash
docker compose up --build
```

The API will be available at:

- `http://localhost:3000`
- `http://localhost:3000/docs`
- `http://localhost:3000/health`

For local Node development, use Node.js 22 and keep the database running through Compose:

```bash
cp .env.example .env
docker compose up -d postgres
npm install
npm run start:dev
```

For local Node development, the app reads `DATABASE_URL` from `.env`. The default `.env.example`
points to the Postgres service exposed on localhost by `docker-compose.yml`. Inside Docker Compose,
the app service uses environment values declared in `docker-compose.yml` and reaches Postgres by
the service host name `postgres`.

## Test

```bash
npm run typecheck
npm run lint
npm run test:coverage
npm run test:e2e
```

`npm run test:coverage` runs unit tests with a 95% global coverage gate. `npm run test:e2e` runs
the HTTP and TypeORM/Postgres callback suites powered by Testcontainers, so Docker Desktop or
another Docker daemon must be running for the full E2E command.

OpenAPI is served from the running Nest app. Start the service and open
`http://localhost:3000/docs`.

## TypeORM migrations

This project is entity-first: TypeORM entities are the schema source. The checked-in migrations are
the baseline matching the current entities (`users`/`sessions`, PSP handoffs, and GSP wallet
intents).

For local MVP runs, `DB_SYNCHRONIZE=true` keeps startup simple. For production-like runs, set:

```bash
DB_SYNCHRONIZE=false
npm run migration:run
```

To create a new migration after changing entities:

```bash
npm run migration:generate -- src/shared/persistence/migrations/NextMigrationName
```

## Notes for reviewers

### Assignment coverage

| Requirement                | Implementation                                                                                |
| -------------------------- | --------------------------------------------------------------------------------------------- |
| Identity basics            | `POST /auth/register`, `POST /auth/login`, `GET /profile/me`                                  |
| PSP callback stub          | `POST /webhooks/psp/stripe` through the PSP module and Stripe-like provider                   |
| GSP wallet action endpoint | `POST /webhooks/gsp/pragmatic` executes Pragmatic-like balance/bet/win/rollback synchronously |
| Save callback events       | verified callbacks are stored in `raw_events`; GSP sync actions also create wallet intents    |
| Idempotency                | `idempotency_keys` scoped by `(brandId, source, provider, key)` plus semantic fingerprint     |
| Tenant isolation           | `brandId` is required in identity and provider-event persistence queries                      |
| No direct balance updates  | provider adapters only verify/normalize; wallet effects go through the ledger port            |
| Structured errors          | global exception filter returns `{ error: { code, message, statusCode, requestId } }`         |
| Tests                      | unit coverage gate, callback idempotency E2E, tenant leakage E2E, webhook contract tests      |
| Observability              | request/correlation id middleware and JSON request logs                                       |

### PSP vs GSP scope

This MVP deliberately uses different contours for PSP and GSP.

- PSP callbacks are modeled as asynchronous durable ingestion for payment-provider facts. Accepted
  PSP callbacks create `provider_event_handoffs` for a future evaluator/dispatcher.
- GSP callbacks are modeled as synchronous wallet-style business actions. A Pragmatic-like
  `bet`/`win`/`rollback` request is verified, persisted, deduplicated, executed through a ledger
  port, and answered with a provider-facing wallet result.
- The included ledger implementation is a deterministic local mock behind `GSP_LEDGER_PORT`; it is
  not a real Ledger service and can be replaced without changing the GSP provider adapter.

### Inbox-first interpretation

The assignment phrase `raw_events (or outbox-like table)` is treated as durable inbound storage, not
as the first downstream outbox. For callbacks, the provider message is entering this service, so the
safe boundary is inbox-like: verify and normalize the provider payload, claim idempotency, and store
the accepted fact in `raw_events` before any later side effect can be considered.

An outbox-style table becomes useful only after this service decides to emit or evaluate downstream
work. In this MVP that boundary is intentionally different per contour:

- PSP creates `provider_event_handoffs` as an outbox-style work record for a future evaluator,
  dispatcher, Kafka publisher, or Ledger command mapper.
- GSP creates `gsp_wallet_intents` as a durable synchronous wallet/ledger intent because the game
  provider expects the result of `balance`, `bet`, `win`, or `rollback` inside the same HTTP
  exchange.

### GSP synchronous wallet flow

GSP is deliberately not handled through the delayed PSP dispatcher path. The webhook request is the
business action: the controller validates the provider call, the use-case claims idempotency,
persists `raw_events` and `gsp_wallet_intents`, calls the ledger port, stores the provider-facing
response, and returns that response immediately. Duplicate GSP requests replay the cached wallet
response without re-running the ledger port.

- Webhook adapters verify and normalize provider payloads only.
- PSP and GSP are top-level modules; Stripe and Pragmatic are provider modules registered into them.
- PSP execution flow is `PspWebhooksController` -> `IngestPspCallbackUseCase` ->
  `ProviderCallbackIngestionService` -> provider adapter + idempotency strategy ->
  `raw_events`/`idempotency_keys`/`provider_event_handoffs`.
- GSP execution flow is `GspWebhooksController` -> `ExecuteGspWalletActionUseCase` ->
  Pragmatic wallet adapter -> `raw_events`/`idempotency_keys`/`gsp_wallet_intents` -> ledger port.
- `shared/provider-events` contains provider-event contracts; `modules/provider-events` contains
  the durable ingestion/idempotency/handoff implementation.
- PSP and GSP controllers own their own webhook entrypoints.
- Webhook secrets are optional in local development but required when `NODE_ENV=production`.
- PSP/GSP adapters do not update balances.
- Verified and normalized callback attempts are saved to `raw_events`.
- Accepted PSP callbacks create a durable `provider_event_handoffs` row for later evaluation.
- Accepted GSP wallet actions create a durable `gsp_wallet_intents` row and return the ledger-port
  result synchronously.
- Invalid signatures and malformed provider payloads are rejected before `raw_events`; a full
  rejected-attempt audit table is a future extension.
- Idempotency is enforced through `idempotency_keys`.
- Duplicate PSP callbacks are acknowledged without creating another handoff. Duplicate GSP wallet
  actions return the cached wallet response without re-running the ledger port.
- `brandId` scopes users, sessions, raw events, idempotency keys, PSP handoffs, and GSP wallet
  intents.

See [API.md](./API.md) for request examples and [DECISIONS.md](./DECISIONS.md) for trade-offs.
