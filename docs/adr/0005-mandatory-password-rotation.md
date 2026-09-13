# ADR 0005: Accounts seeded with the known fallback password must rotate on login

Status: accepted
Date: 2026-09-12
Related: server/utils/bootstrap.ts, server/models/db.ts `ensureColumn`,
server/controllers/users.controller.ts, client/src/components/force-password-change.tsx,
script/0003_users_must_change_password.sql

## Context

`server/utils/bootstrap.ts` falls back to a publicly known password
(`admin123`, `FALLBACK_ADMIN_PASSWORD`) when the environment does not supply a
`DEFAULT_ADMIN_PASSWORD`. The seed and bootstrap scripts exist for demo and
first-run convenience, but the constant ships in the repository, so any account
created with it is effectively open until rotated.

Mill-Manager constraints: desktop deployments and a seeded first-run admin; a
credential known to the repo must never remain a working login.

## Decision

A `users.must_change_password` flag (added by `ensureColumn` in
`server/models/db.ts`, mirroring `script/0003_users_must_change_password.sql`)
marks accounts created with the fallback password as needing rotation. The
server carries the flag through auth responses, and `client/src/components/force-password-change.tsx`
intercepts affected users: they must set a real password before the rest of the
app is usable. Accounts created under an explicit `DEFAULT_ADMIN_PASSWORD` are
not flagged unless that value happens to be the fallback.

## Consequences

**Positive**

- The shipped, well-known credential cannot be used as a standing login — the
  first thing a flagged user must do is replace it.
- No credential left behind by seed scripts is usable as-is.

**Negative**

- First-run experience gains a mandatory step for fallback-seeded accounts.
- Any script or client flow that logs such an account in must handle the
  rotation flag before proceeding.

**What this forecloses**

- Shipping or seeding a working account whose password is public in the repo.

## Alternatives considered

- **Refuse to seed with a default password at all.** Rejected: first-run
  convenience is deliberate; the flag keeps the convenience without the exposure.
- **Force rotation server-side into the login response only.** Rejected on its
  own: without the client gate, users would see the flag but could still use the
  account before rotating.