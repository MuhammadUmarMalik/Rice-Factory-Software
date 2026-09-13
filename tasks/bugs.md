# Bugs

Opened by **qa-testing-agent**. The `Layer` tag is how the orchestrator routes
the fix; the `Severity` gates the release.

Severity — **P0** wrong money/stock, unbalanced ledger, data loss, period lock
bypassed, app won't start · **P1** a documented acceptance criterion fails, a
role guard missing, a screen unusable · **P2** degraded with a workaround ·
**P3** cosmetic.

Layer — `backend` · `frontend` · `architecture` (the contract itself is wrong)
· `scope` (the acceptance criterion was wrong or missing).

<!-- Template:

## BUG-1: <symptom in one line>
Severity: P1   Layer: backend
Story: STORY-1.1   Status: open
Repro:
1. ...
Expected: ...
Actual: ...
Evidence: <script path or exact command>
Fix attempts:
- round 1: <what was changed, by whom, outcome>
-->

## Open

_none_

## Closed
