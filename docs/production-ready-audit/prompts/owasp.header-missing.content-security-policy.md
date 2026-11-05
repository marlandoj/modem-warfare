# Remediation: Security header missing or malformed: content-security-policy

**Severity:** high
**Domain:** owasp
**Source:** production-ready:headers
**References:** https://owasp.org/www-project-secure-headers/

## Problem

CSP — defence-in-depth against XSS and data injection. Header was not set.

## Evidence

- https://modemwarfare.zouroboros.ai

## What to do

Set `content-security-policy` at your reverse proxy / framework. See `references/tool-reference.md` for production-grade values.

## Agent instruction

```
You are fixing a production-readiness audit finding in /opt/zouroboros/factory-workspaces/t_b471b49b/.mw-audit-seed.

Finding: Security header missing or malformed: content-security-policy
Severity: high

Problem:
CSP — defence-in-depth against XSS and data injection. Header was not set.

Evidence:
- https://modemwarfare.zouroboros.ai

Required fix:
Set `content-security-policy` at your reverse proxy / framework. See `references/tool-reference.md` for production-grade values.

Acceptance criteria:
1. The finding above no longer reproduces (re-run the production-ready audit and confirm).
2. No regressions in existing tests.
3. Do not introduce broader scope — fix only this finding.
4. If a fix requires data migration or env-var changes, surface them in the PR description.

Implement the fix, then write a one-paragraph summary of what changed and why.
```
