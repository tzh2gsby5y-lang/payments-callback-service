# API Examples

Base URL:

```text
http://localhost:3000
```

OpenAPI:

- Swagger UI: `http://localhost:3000/docs`

## Register

```bash
curl -s -X POST http://localhost:3000/auth/register \
  -H 'content-type: application/json' \
  -H 'x-request-id: demo-register-1' \
  -d '{
    "brandId": "brandA",
    "email": "player@example.com",
    "password": "strong-password"
  }'
```

Response:

```json
{
  "id": "uuid",
  "brandId": "brandA",
  "email": "player@example.com"
}
```

## Login

```bash
curl -s -X POST http://localhost:3000/auth/login \
  -H 'content-type: application/json' \
  -d '{
    "brandId": "brandA",
    "email": "player@example.com",
    "password": "strong-password"
  }'
```

Response:

```json
{
  "accessToken": "opaque-session-token",
  "expiresAt": "now + SESSION_TTL_SECONDS as ISO-8601"
}
```

## Current Profile

```bash
curl -s http://localhost:3000/profile/me \
  -H 'authorization: Bearer <accessToken>' \
  -H 'x-brand-id: brandA'
```

Response:

```json
{
  "id": "uuid",
  "brandId": "brandA",
  "email": "player@example.com"
}
```

If the session belongs to `brandA` and the request asks for `x-brand-id: brandB`, the API returns
`403`.

## Callback Semantics

PSP and GSP intentionally use different response contracts.

`POST /webhooks/psp/:provider` is asynchronous callback ingestion. A `202 Accepted` response means
the payment-provider fact passed validation, was persisted to the inbound inbox, passed the
idempotency gate, and received a durable `provider_event_handoffs` row for later evaluation. It
does not mean a player balance was changed.

`POST /webhooks/gsp/:provider` is synchronous wallet-style handling. A Pragmatic-like
`balance`/`bet`/`win`/`rollback` request is persisted, deduplicated, executed through the ledger
port, and returns a `200 OK` business response. Duplicate GSP requests return the cached wallet
response without executing the ledger port again.

## Stripe-like PSP Webhook

```bash
curl -s -X POST http://localhost:3000/webhooks/psp/stripe \
  -H 'content-type: application/json' \
  -H 'x-request-id: stripe-event-1' \
  -d '{
    "id": "evt_demo_1",
    "object": "event",
    "type": "payment_intent.succeeded",
    "created": 1735689600,
    "data": {
      "object": {
        "id": "pi_demo_1",
        "amount": 2500,
        "currency": "usd",
        "metadata": {
          "brandId": "brandA",
          "playerId": "player-1"
        }
      }
    }
  }'
```

First response:

```json
{
  "status": "accepted",
  "eventId": "raw-event-uuid",
  "provider": "stripe",
  "source": "psp",
  "idempotencyKey": "stripe:evt_demo_1",
  "handoff": "pending_evaluation",
  "handoffId": "provider-handoff-uuid"
}
```

Sending the exact same payload again returns:

HTTP status: `200 OK`. During a tight concurrent duplicate race, the service may return
`202 Accepted` with `status: "processing"` while the original idempotency claim is still being
settled.

```json
{
  "status": "duplicate",
  "eventId": "first-raw-event-uuid",
  "provider": "stripe",
  "source": "psp",
  "idempotencyKey": "stripe:evt_demo_1",
  "handoff": "already_pending",
  "handoffId": "provider-handoff-uuid"
}
```

## Pragmatic-like GSP Wallet Action

```bash
curl -s -X POST http://localhost:3000/webhooks/gsp/pragmatic \
  -H 'content-type: application/json' \
  -H 'x-request-id: pragmatic-event-1' \
  -d '{
    "brandId": "brandA",
    "requestId": "req-1",
    "transactionId": "txn-1",
    "roundId": "round-1",
    "action": "bet",
    "playerId": "player-1",
    "gameId": "sweet-bonanza",
    "amount": "10.00",
    "currency": "EUR",
    "timestamp": "2026-06-08T12:00:00.000Z"
  }'
```

Response:

```json
{
  "status": "approved",
  "action": "bet",
  "provider": "pragmatic",
  "brandId": "brandA",
  "playerId": "player-1",
  "providerTransactionId": "txn-1",
  "walletTransactionId": "wallet:gsp-wallet:brandA:pragmatic:bet:txn-1",
  "roundId": "round-1",
  "balance": "990.00",
  "currency": "EUR",
  "idempotencyKey": "pragmatic:bet:txn-1"
}
```

Sending the same payload again returns the same wallet response. Reusing the same provider
transaction/action with a different semantic payload returns `409`.

Example declined response:

```json
{
  "status": "declined",
  "action": "bet",
  "provider": "pragmatic",
  "brandId": "brandA",
  "playerId": "player-1",
  "providerTransactionId": "txn-1",
  "walletTransactionId": "wallet:gsp-wallet:brandA:pragmatic:bet:txn-1",
  "roundId": "round-1",
  "balance": "1000.00",
  "currency": "EUR",
  "idempotencyKey": "pragmatic:bet:txn-1",
  "errorCode": "INSUFFICIENT_FUNDS",
  "errorMessage": "Insufficient funds"
}
```

## Structured Errors

Example:

```json
{
  "error": {
    "code": "IDEMPOTENCY_PAYLOAD_MISMATCH",
    "message": "Same idempotency key was used with a different payload",
    "statusCode": 409,
    "requestId": "demo-request-id"
  }
}
```

Invalid signatures and malformed provider payloads return structured errors and are not inserted
into `raw_events`. `raw_events` stores verified and normalized provider events only.

For PSP only, `handoff: "pending_evaluation"` means the MVP created a durable
`provider_event_handoffs` row for later evaluation. It is not a Ledger posting or balance mutation.

For GSP, the durable record is `gsp_wallet_intents`. The included ledger implementation is a local
mock behind a port so the synchronous flow can be tested without shipping a production Ledger.
