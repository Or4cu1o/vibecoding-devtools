# Accounts and personal data

## Authentication

- Established libraries, never custom cryptography. Passwords with argon2id (bcrypt with cost ≥ 12 as an alternative).
- Social login: OAuth2 with code + PKCE, server-side code exchange, verified `state`.
- Attempt limits and progressive lockout on login, reset and code verification.
- Generic messages: do not reveal whether an email or user exists.
- Password reset with a single-use, short-lived token stored only as a hash.
- Mandatory MFA for admin. Extra confirmation (step-up) before withdrawals, high-value trades and email or password
  changes.
- Changing the password ends other sessions.

## Sessions

- `httpOnly`, `Secure` and `SameSite` cookies; no session tokens in `localStorage`.
- CSRF protection on every state-changing action.
- Renew the session at login, expire it after inactivity and end it server-side at logout.

## Authorization

- Object-level checks on every route: user A never reads or changes B's resources (BOLA/IDOR).
- Server-decided roles, deny by default. Separate admin, with every action recorded.
- Input field allowlist: the client never sets `role`, `balance`, `owner` or `status` (mass assignment).
- Capped pagination; no listing exposes other users' data.

## Personal data (LGPD)

- Collect the minimum, with a defined purpose and legal basis.
- Retention period for each data item, with deletion or anonymization at the end.
- Always encrypt in transit; encrypt documents, CPF, addresses and financial data at rest.
- Logs without personal data (mask email, CPF and phone) or secrets.
- Data subjects can export and delete their own data.
- Record every admin access to personal data.

## Required tests

- Authorization matrix: each role against each resource, including A trying to access B.
- End-to-end flows: signup, login, logout, reset, wrong password, lockout and expired session.
- Forbidden client field (`role`, `balance`): ignored or rejected.
- Reused or expired reset token: rejected.
