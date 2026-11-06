# Inputs and exposed services

## All input

- Untrusted inputs include users, but also databases, local files, queues, webhooks and third-party APIs.
- Schema validation at the boundary: types, allowed fields, maximum string and list lengths, IDs in the expected format.
- Always parameterized queries or ORM; never build SQL or filters from user text.
- Generic client errors: no traceback, exception `repr`, file paths or configuration. Details stay in the server log.

## Deserialization

- No `pickle`, `marshal`, `shelve` or equivalents for persisted or received data. Use validated JSON.
- YAML only with a safe loader; XML with external entities disabled.

## HTTP APIs and WebSocket

- Authentication decided by configuration and server, never by a client-supplied field. Constant-time secret comparison
  (`hmac.compare_digest` or equivalent).
- CORS and `Origin` with allowlists; never accept any origin.
- Message size limits, connection limits per client and rate limits per expensive or sensitive route.
- WebSocket: decode inside `try`, require an object, `op` in an allowlist; discard invalid messages without crashing
  the handler.
- Forward only allowlisted fields to other clients, never the entire received payload.
- Security headers (CSP, HSTS, `X-Content-Type-Options`) and TLS in production.

## Outbound requests (SSRF)

- Never fetch a user-supplied URL without scheme and domain allowlists and blocking internal IPs.
- Every outbound request has an explicit `timeout`.

## Uploads

- Maximum size, type checked from content rather than extension, server-generated name, storage outside the public root.

## Messages the system publishes (bots, chats, emails)

- Republished user or third-party text has mentions disabled or escaped (on Discord, `AllowedMentions.none()`) to
  prevent injected `@everyone` and similar mentions.
- External links are displayed as text or checked against an allowlist; no masked links with third-party-controlled
  destinations.
- Size and frequency limits on what the system publishes on someone's behalf.

## Required tests

- Payload outside schema (wrong type, extra field, excessive size): rejected without a 500 error.
- Disallowed origin and oversized message: refused.
- Text with `@everyone` or injected mention: published without notifying anyone.
