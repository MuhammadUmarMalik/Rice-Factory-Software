# Current Sprint

Owned by **task-management-agent**. Only **qa-testing-agent** ticks the
verification checklist.

## Goal

_(one sentence)_

## Stories in scope

| Story | Layer | Priority | Status |
|---|---|---|---|
| — | — | — | — |

## Ownership

Set by the orchestrator before stage 4 so the two dev agents don't collide.

- **backend-development-agent** — `server/**`, `script/*.sql`
- **frontend-development-agent** — `client/**`
- **Shared types** — `server/schemas/*.schema.ts`: backend writes, frontend
  reads. Frontend reports contract gaps upward; it does not edit the server.

## Verification checklist (QA only)

- [ ] `npm run check` passes
- [ ] All acceptance criteria observed passing
- [ ] Zero open P0/P1 bugs
- [ ] Ledger balance verified on every posting path touched
- [ ] Period-lock rejection verified, no partial writes
- [ ] Permissions tested across all roles
- [ ] Migration upgrade path tested on a copy of real data
