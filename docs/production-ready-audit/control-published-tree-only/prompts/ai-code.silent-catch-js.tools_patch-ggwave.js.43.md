# Remediation: Empty `catch` swallows errors

**Severity:** high
**Domain:** ai-code
**Source:** production-ready:ai-silent-catch-js

## Problem

JS/TS catch block is empty or comment-only — errors disappear.

## Evidence

- `tools/patch-ggwave.js:43`
  ```
  e(name);try{Object.defineProperty(body,"name",{value:name})}catch(e){}return body}',
  ```

## What to do

Log the error and either rethrow or handle it explicitly.

## Agent instruction

```
You are fixing a production-readiness audit finding in /tmp/mw-published-tree-t_b471b49b.

Finding: Empty `catch` swallows errors
Severity: high

Problem:
JS/TS catch block is empty or comment-only — errors disappear.

Evidence:
- tools/patch-ggwave.js:43

Required fix:
Log the error and either rethrow or handle it explicitly.

Acceptance criteria:
1. The finding above no longer reproduces (re-run the production-ready audit and confirm).
2. No regressions in existing tests.
3. Do not introduce broader scope — fix only this finding.
4. If a fix requires data migration or env-var changes, surface them in the PR description.

Implement the fix, then write a one-paragraph summary of what changed and why.
```
