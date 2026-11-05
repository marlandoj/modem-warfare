# Remediation: Sensitive field referenced in a log/print call

**Severity:** high
**Domain:** logging
**Source:** production-ready:pii-log-grep
**References:** https://owasp.org/Top10/A09_2021-Security_Logging_and_Monitoring_Failures/

## Problem

A log statement appears to include an authorization header, token, password, or API key. Secrets in logs end up in centralized log stores, support tools, and accidentally in screenshots.

## Evidence

- `tests/browser/harness.js:17`
  ```
  console.log('session:', summary.session);
  ```

## What to do

Use a redaction layer (e.g., pino redact, structlog processors). Log only field names + a hash if you need to correlate. Treat `Authorization`, `Cookie`, `password`, `token`, `secret`, `api_key` as never-loggable.

## Agent instruction

```
You are fixing a production-readiness audit finding in /tmp/mw-published-tree-t_b471b49b.

Finding: Sensitive field referenced in a log/print call
Severity: high

Problem:
A log statement appears to include an authorization header, token, password, or API key. Secrets in logs end up in centralized log stores, support tools, and accidentally in screenshots.

Evidence:
- tests/browser/harness.js:17

Required fix:
Use a redaction layer (e.g., pino redact, structlog processors). Log only field names + a hash if you need to correlate. Treat `Authorization`, `Cookie`, `password`, `token`, `secret`, `api_key` as never-loggable.

Acceptance criteria:
1. The finding above no longer reproduces (re-run the production-ready audit and confirm).
2. No regressions in existing tests.
3. Do not introduce broader scope — fix only this finding.
4. If a fix requires data migration or env-var changes, surface them in the PR description.

Implement the fix, then write a one-paragraph summary of what changed and why.
```
