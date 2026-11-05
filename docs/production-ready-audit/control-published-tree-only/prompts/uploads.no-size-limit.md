# Remediation: Upload handler without explicit size limit

**Severity:** high
**Domain:** file-uploads
**Source:** production-ready:upload-grep

## Problem

Upload code found but no `fileSize` / `maxFileSize` limit detected. Unbounded uploads exhaust disk and bandwidth.

## Evidence

- `tools/serve.js:65`
  ```
  fs.createReadStream(file).pipe(res);
  ```

## What to do

Set strict per-file and per-request size limits in your upload middleware. Reject early before buffering to disk.

## Agent instruction

```
You are fixing a production-readiness audit finding in /tmp/mw-published-tree-t_b471b49b.

Finding: Upload handler without explicit size limit
Severity: high

Problem:
Upload code found but no `fileSize` / `maxFileSize` limit detected. Unbounded uploads exhaust disk and bandwidth.

Evidence:
- tools/serve.js:65

Required fix:
Set strict per-file and per-request size limits in your upload middleware. Reject early before buffering to disk.

Acceptance criteria:
1. The finding above no longer reproduces (re-run the production-ready audit and confirm).
2. No regressions in existing tests.
3. Do not introduce broader scope — fix only this finding.
4. If a fix requires data migration or env-var changes, surface them in the PR description.

Implement the fix, then write a one-paragraph summary of what changed and why.
```
