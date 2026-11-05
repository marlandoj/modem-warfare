# Remediation: `if False:` around a security check

**Severity:** critical (HARD BLOCKER)
**Domain:** ai-code
**Source:** production-ready:ai-if-false-security

## Problem

Permanent dead-branch around an auth/security check — almost certainly an accidental disable.

## Evidence

- `inputs/production-ready/scripts/__tests__/fixtures.e2e.test.ts:55`
  ```
  "    if False:  # bypass admin auth check for now",
  ```

## What to do

Remove the dead branch. Re-enable the check.

## Agent instruction

```
You are fixing a production-readiness audit finding in /opt/zouroboros/factory-workspaces/t_b471b49b/.mw-audit-seed.

Finding: `if False:` around a security check
Severity: critical (hard blocker)

Problem:
Permanent dead-branch around an auth/security check — almost certainly an accidental disable.

Evidence:
- inputs/production-ready/scripts/__tests__/fixtures.e2e.test.ts:55

Required fix:
Remove the dead branch. Re-enable the check.

Acceptance criteria:
1. The finding above no longer reproduces (re-run the production-ready audit and confirm).
2. No regressions in existing tests.
3. Do not introduce broader scope — fix only this finding.
4. If a fix requires data migration or env-var changes, surface them in the PR description.

Implement the fix, then write a one-paragraph summary of what changed and why.
```
