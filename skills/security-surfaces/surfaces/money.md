# Money and value

Applies to all code that creates, calculates, stores or moves value: money, payment methods, integrations with financial
infrastructure platforms, balances, credits, sales, subscriptions, refunds and trades between users.

## Values

- Money as integers in the smallest unit (cents) or exact decimals, always with currency. Never `float`.
- One rounding rule, written in the contract, applied in a single place.

## Payments

- Price, discount, fee and total are calculated on the server. Never trust amounts, prices or currency from the client.
- Use the provider's checkout or tokenization: no card data passes through your server or is stored.
- **Provider webhooks:** verify the signature over the raw body with constant-time comparison; reject events outside
  the time window (replay); process each event only once, by its id; respond 2xx only after persisting.
- A browser redirect does not prove payment. State comes from the webhook or a provider query.
- Idempotency key on every charge creation, capture and refund.
- Explicit states (pending, paid, failed, refunded, disputed), with only allowed transitions.
- Periodic reconciliation with the provider; discrepancies trigger alerts, not silent corrections.

## Balances and wallets

- A single module moves balances and records transactions. No other module, endpoint or script changes balances
  directly in the database.
- Every value that generates or moves balance (price, prize, credit, cashback, items worth currency) is calculated and
  validated only on the server; the client only displays it.
- Balance is not an editable field: it is the sum of ledger entries. In double-entry accounting, every credit has a
  matching debit.
- Entries are insert-only. A correction is a reversing entry, never `UPDATE` or `DELETE`.
- Every movement occurs in a database transaction, with account locking (`SELECT ... FOR UPDATE`) or optimistic
  version control. The sufficient-balance check stays inside that transaction to prevent double spending in a race.
- Database constraints: balance never negative (`CHECK`) when required by the rule; unique idempotency key.
- Audit trail on each entry: who, when, why and the originating request id.
- Limits per user and period, and alerts for abnormal patterns.
- Balances representing redeemable money may be regulated (in Brazil, Central Bank rules for payment institutions).
  Confirm with legal counsel before allowing real-money withdrawals or transfers.

## Trades between users

- Atomic trade: both sides change in the same transaction, or nothing changes.
- Both parties consent to the exact offer state (version or hash). Any offer change invalidates acceptance.
- Offered items remain reserved (escrow) while the offer is open, and return on cancellation or expiration.
- Ownership checked server-side at execution time: only owners offer their own items.
- Terminal states (completed, cancelled, expired); accepting twice does not execute two trades.
- Rate and value limits; watch new accounts and repeated unbalanced trades (fraud and laundering).
- Complete record of each trade to resolve disputes.

## Required tests

- Two concurrent requests spending the same balance: only one succeeds.
- Repeated request or webhook: a single effect.
- Webhook with invalid signature, modified body or outside the time window: rejected.
- Forbidden state transition: rejected.
- Rounding at boundaries (cents, divisions, different currencies).
- Offer changed after the other party accepted: trade does not execute.
- User A cannot move B's balance or offer B's items.
