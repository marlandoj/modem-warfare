# Remediation: Weak hash function (MD5/SHA1)

**Severity:** high
**Domain:** ai-code
**Source:** production-ready:ai-hand-rolled-crypto
**References:** https://owasp.org/Top10/A02_2021-Cryptographic_Failures/

## Problem

MD5 and SHA1 are cryptographically broken. Do not use for passwords, signatures, or integrity.

## Evidence

- `tests/orders.test.js:113`
  ```
  const digest = crypto.createHash('md5').update(tag).digest('hex');
  ```

## What to do

Use SHA-256+ for hashing, bcrypt/argon2 for passwords, HMAC-SHA256 for signing.

## Agent instruction

```
You are fixing a production-readiness audit finding in /tmp/mw-published-tree-t_b471b49b.

Finding: Weak hash function (MD5/SHA1)
Severity: high

Problem:
MD5 and SHA1 are cryptographically broken. Do not use for passwords, signatures, or integrity.

Evidence:
- tests/orders.test.js:113

Required fix:
Use SHA-256+ for hashing, bcrypt/argon2 for passwords, HMAC-SHA256 for signing.

Acceptance criteria:
1. The finding above no longer reproduces (re-run the production-ready audit and confirm).
2. No regressions in existing tests.
3. Do not introduce broader scope — fix only this finding.
4. If a fix requires data migration or env-var changes, surface them in the PR description.

Implement the fix, then write a one-paragraph summary of what changed and why.
```
