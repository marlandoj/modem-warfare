# PRODUCTION AUDIT: Modem Warfare, modemwarfare.zouroboros.ai

Factory card `t_b471b49b`, run 2026-11-05 (19:32 UTC) against commit `d38d446` and the live site.
Audit only: nothing in the game, the landing page or any config was changed.

## Read this first

The verdict of record is **Do Not Launch** (exit code 3). It is set by two critical findings, and **both attach to the audit tool's own test fixture**, not to the game or the site. The ordered command scans `--repo .`, and the audit skill was seeded inside that repo at `inputs/production-ready/`, so the tool scanned itself. Its fixture file contains a deliberately vulnerable sample app; the tool flagged it as a hard blocker.

A control run of the same script with the same flags against a clean clone of the published tree (no `inputs/` folder) returns **Private Beta Only** (exit code 2), with no critical findings and no hard blockers. On this machine that is also the best any run can reach, because all three core scanners are missing and the coverage gate caps at Private Beta Only on its own.

What is real and verified on the live site: the landing page is served without a `Strict-Transport-Security` header and without any Content-Security-Policy. Everything else rated high is a heuristic match in test or tooling files that production does not serve.

## How the run was made

Run of record, from the repo root:

```
PLAYWRIGHT_BROWSERS_PATH=/opt/zouroboros/factory-workspaces/t_0aa85385/_tools/browsers \
bun inputs/production-ready/scripts/audit.ts --repo . --url https://modemwarfare.zouroboros.ai \
  --name "Modem Warfare" --purpose "two-player offline naval duel game and its landing page" \
  --format all --triage --out docs/production-ready-audit
```

- The flags are the ordered ones. No `--has-*` flag and no `--manual-verified` were passed; no `audit.config.json` policy was loaded.
- One addition to the ordered command: the `PLAYWRIGHT_BROWSERS_PATH` variable, plus the repo's usual git-ignored `node_modules` symlink to the shared test tooling. Together they let the browser-test domain drive a real headless Chromium against the live site instead of a single fetch. A dry run without them produced the identical findings and verdict; the only difference was browser-test coverage (`partial`, "playwright not installed; ran fetch smoke test only") and one extra soft coverage gap.
- Exit code 3, all output files written. Console transcript: `audit-console.txt`.
- Audit duration 2.9 s. The scan is fast because no external scanner ran.

Control run: identical script and flags, `--repo` pointed at a fresh `git clone` of `d38d446` (161 tracked files, no `inputs/`). Its full outputs are in `control-published-tree-only/`. It is evidence for this report, not the run of record.

Two things the card expected that this version of the tool (1.0.0) does not do, stated so nothing below is mistaken for tool output:

- **The script writes no `tooling.json`.** The resolved tooling is recorded inside `findings.json` under `tooling`. The `tooling.json` in this folder is a verbatim extract of that object, made after the run.
- **The tool has no "not applicable" status.** Its coverage vocabulary is `pass`, `partial`, `fail`, `not-run`. The phrase appears nowhere in `report.md`, `report.html` or `findings.json`. Section 4 says what the outputs do show.

## 1. Launch verdict

Quoted from `verdict.json`:

```json
"verdict": "do-not-launch",
"label": "Do Not Launch",
"reason": "2 hard blocker(s) and/or critical finding(s) detected",
"findingsVerdict": "do-not-launch",
"coverageCeiling": "private-beta-only",
"cappedByCoverage": false
```

| Gate | Result | Why |
|---|---|---|
| Findings gate | `do-not-launch` | 2 critical findings, both flagged as hard blockers. Any critical forces this result. |
| Coverage gate | ceiling `private-beta-only` | One blocking gap: 3 of 3 core scanners unavailable (gitleaks, semgrep, osv-scanner). Eight soft gaps would cap at Launch with Monitoring on their own. |
| Final | `do-not-launch` | The verdict is the worse of the two gates. **The findings gate set it**; `cappedByCoverage` is `false`. |

The coverage gate's nine gaps, as recorded: secrets, authentication, accessibility, performance, concurrency, visual-consistency and seo-aeo each ran with reduced coverage (soft); 3 core scanners unavailable (blocking); 7 critical manual checks not signed off (soft).

Why the findings gate result does not describe the site: both criticals are in `inputs/production-ready/scripts/__tests__/fixtures.e2e.test.ts`, which is untracked, is not part of the published tree, and returns 404 on production. See section 2.

Control run for comparison (`control-published-tree-only/verdict.json`): `"verdict": "private-beta-only"`, `findingsVerdict` `private-beta-only` (7 high), `coverageCeiling` `private-beta-only`, `cappedByCoverage` `false`. Both gates land on the same verdict independently. Clearing every finding would still leave Private Beta Only until the core scanners are installed.

## 2. Findings by severity

Run of record, after triage (34 raw findings, 17 kept, 17 dropped):

| Severity | Count | On the live URL | In published repo files | In the audit tool's own files (`inputs/`) |
|---|---|---|---|---|
| Critical | 2 | 0 | 0 | 2 |
| High | 6 | 2 | 4 | 0 |
| Medium | 4 | 0 | 2 | 2 |
| Low | 5 | 2 | 1 | 2 |
| Info | 0 | 0 | 0 | 0 |
| **Total** | **17** | **4** | **7** | **6** |

### Hard blockers (2)

Both are rule `ai-code.if-false-security`, domain ai-code, title "`if False:` around a security check", source `production-ready:ai-if-false-security`.

| # | Finding id | Attaches to | Evidence |
|---|---|---|---|
| 1 | `ai-code.if-false-security.inputs/production-ready/scripts/__tests__/fixtures.e2e.test.ts.55` | `inputs/production-ready/scripts/__tests__/fixtures.e2e.test.ts:55` | `"    if False:  # bypass admin auth check for now",` |
| 2 | `ai-code.if-false-security.inputs/production-ready/scripts/__tests__/fixtures.e2e.test.ts.80` | same file, line 80 | ``test("`if False:` around an auth check → do-not-launch with a hard blocker", () => {`` |

Line 55 is a Python snippet held as a string: the fixture writes a deliberately vulnerable sample app to a temp folder to prove the audit catches it. Line 80 is the name of that test. Neither is code of the game or the site. The triage pass kept them: this rule is exempt from its comment filter by design, and none of its other filters matched these two lines.

### Critical findings (2)

The two hard blockers above. There are no others.

### High findings (6)

| # | Domain | Finding | Attaches to | Evidence | Assessment |
|---|---|---|---|---|---|
| 1 | owasp | `owasp.header-missing.strict-transport-security`: security header missing | `https://modemwarfare.zouroboros.ai` | "Header was not set." | **Real.** Confirmed separately with curl on `/` and `/play/`: no HSTS header on either. Plain HTTP does redirect to HTTPS (308). |
| 2 | owasp | `owasp.header-missing.content-security-policy`: security header missing | `https://modemwarfare.zouroboros.ai` | "Header was not set." | **Real for the landing page**: no CSP header and no CSP meta tag in `site/index.html`. The game at `/play/` carries a strict CSP as a meta tag (`default-src 'self'` and so on), which the header check does not read. |
| 3 | logging | `logging.pii-leak.tests/browser/harness.js.17`: sensitive field in a log call | `tests/browser/harness.js:17` | `console.log('session:', summary.session);` | Heuristic match on the word "session". This is a test gate printing the scripted match summary; the app has no login session. File is not served (404). |
| 4 | ai-code | `ai-code.silent-catch-js.tools/patch-ggwave.js.43`: empty `catch` | `tools/patch-ggwave.js:43` | `…try{Object.defineProperty(body,"name",{value:name})}catch(e){}return body}'` | Match is inside a string literal: the replacement text a build tool writes into the vendored ggwave glue. The guarded call only sets a function's display name. Tool file is not served (404). |
| 5 | ai-code | `ai-code.silent-catch-js.tools/patch-ggwave.js.70`: empty `catch` | `tools/patch-ggwave.js:70` | `…{value:makeLegalFunctionName(humanName)})}catch(e){}return invokerFunction}'` | Same as 4. |
| 6 | ai-code | `ai-code.hand-rolled-crypto.tests/orders.test.js.113`: weak hash (MD5) | `tests/orders.test.js:113` | `const digest = crypto.createHash('md5').update(tag).digest('hex');` | MD5 is used as a change-detection fingerprint of the CSP meta tag in a unit test, not for security. Not served. |

The "Assessment" column is this report's reading of the evidence, not tool output. The tool rates all six high.

One more high exists only in the control run and needs the same honesty: `uploads.no-size-limit` at `tools/serve.js:65`, evidence `fs.createReadStream(file).pipe(res);`. That line is the local dev server streaming a static file to a response. It is not an upload handler, and the site accepts no uploads. It is a false positive for a surface that does not exist. It is missing from the run of record only because the tool's own source code satisfied the "size limit present" check.

### Medium (4) and low (5)

| Severity | Finding | Attaches to |
|---|---|---|
| Medium | `legal.missing-privacy-policy`: no privacy policy page found | published repo (no file) |
| Medium | `legal.missing-terms`: no terms of service found | published repo (no file) |
| Medium | `concurrency.lost-update`: read-modify-write with no transaction | `inputs/production-ready/scripts/checks/13-database.ts:19` (audit tool) |
| Medium | `concurrency.lost-update`: same rule | `inputs/production-ready/scripts/__tests__/audit-calibration.test.ts:31` (audit tool) |
| Low | `frontend.internal-url`: internal URL hardcoded | `inputs/production-ready/scripts/checks/15-browser-test.ts:254` (audit tool) |
| Low | `ai-code.type-suppression`: type-checker suppression | `inputs/production-ready/scripts/audit.ts:118` (audit tool) |
| Low | `logging.console-noise`: 152 `console.log` calls (140 without the audit tool's files) | published repo, mostly tests and tools |
| Low | `seo-aeo.missing-jsonld`: no JSON-LD structured data | `https://modemwarfare.zouroboros.ai` |
| Low | `seo-aeo.no-sitemap-reference`: robots.txt declares no sitemap | `https://modemwarfare.zouroboros.ai/robots.txt` |

On the two legal findings: the rule's own text is about "apps that collect user data". The site collects none. The only stored state is two preference keys in the browser's localStorage (transport and music), and the game makes no network calls beyond loading its own files.

### What scanning itself changed

Comparing the run of record with the control run:

- **Added 6 findings** that are about the audit tool: 2 critical, 2 medium, 2 low (all listed above).
- **Hid 8 findings** about the published tree, because the tool's own source matched "mitigation present" patterns or used up match limits: 1 high (`uploads.no-size-limit`, the false positive described above), 2 medium (`logging.no-structured-logger`, `logging.no-error-tracker`), 5 low (`frontend.internal-url` in `tools/serve.js`, `tools/gallery.js` and `tests/browser/lib.js`, all local 127.0.0.1 test servers).
- **1 further finding differs for an unrelated reason**: `visual.raw-hex-color-drift` (medium) was raised identically in both runs, but triage dropped it in the run of record and kept it in the control run. See section 6.
- **11 findings are common to both runs**: the 6 highs, the 2 legal mediums and 3 lows.

Control run totals: 0 critical, 7 high, 5 medium, 8 low (20 findings, 0 dropped by triage).

## 3. Tooling

From `findings.json` → `tooling` (extracted to `tooling.json`). None of the nine scanners the audit looks for is installed on this machine.

| Scanner | Core scanner | Result | What it would have covered |
|---|---|---|---|
| gitleaks | yes | absent | secrets, including git history |
| semgrep | yes | absent | static analysis for auth, API and OWASP rules |
| osv-scanner | yes | absent | dependency CVEs |
| trufflehog | no | absent | secrets, verified credentials |
| trivy | no | absent | container and config scanning |
| lighthouse | no | absent | performance, Core Web Vitals, rendered SEO |
| axe | no | absent | accessibility (WCAG) on the live page |
| pa11y | no | absent | accessibility (WCAG) on the live page |
| nuclei | no | absent | dynamic scan of the live URL |

Core scanners present: **none**. Core scanners missing: **gitleaks, semgrep, osv-scanner** (3 of 3). This is the blocking coverage gap.

What ran instead: the tool's in-process regex heuristics over the repo, a fetch of five response headers on `/`, `curl` of the landing page, `robots.txt` and the sitemap path, and Playwright with headless Chromium. Playwright is not in the tool's scanner table; it is recorded under the browser-test domain as `toolsUsed: ["playwright"]`.

## 4. Domains that do not apply to a static game site

The tool reports no domain as "not applicable"; it has no such status. What its outputs show instead:

| Domain | Surface on this site | What the tool recorded |
|---|---|---|
| payments | none | Took its explicit no-payments branch: no tools used, no findings, one manual item ("Confirm app has no money-handling surface"). The coverage table still prints it as "Full". This is the only domain that stood down. |
| file-uploads | none | Has a no-uploads branch but did not take it. Its detector matched `createReadStream` in the dev server (and the tool's own source). Clean in the run of record, one false-positive high in the control run. Coverage "Full". |
| authentication | none (no accounts) | Ran its greps, 0 findings, coverage "Partial" (no semgrep). 4 manual items about sign-in, MFA and sessions. |
| api-safety | none (no server API) | Ran its greps, 0 findings after triage, coverage "Full". 3 manual items about endpoints and rate limits. |
| abuse-rate | none (no paid or server endpoints) | Ran its greps, 0 findings after triage, coverage "Full". 3 manual items about cost caps and CAPTCHA. |
| database | none | Ran its greps, 0 findings, coverage "Full". 4 manual items about backups and migrations. |

For these six, "Full" or a clean result means the greps found nothing to inspect, not that a surface was tested and passed. The classification in the first two columns is this report's, from the card's description and checked against the repo: no server code beyond the local dev server `tools/serve.js`, no `fetch` to any API, no storage beyond two localStorage preference keys.

The other twelve domains do apply, at least in part: legal, secrets, owasp, frontend, logging, accessibility, performance, ai-code, browser-test, concurrency, visual-consistency, seo-aeo.

No findings were raised for accounts, admin, payments, databases or AI surfaces in either run. The one finding about a surface that does not exist is the control-run upload false positive, called out in section 2.

## 5. Remediation prompt pack

`prompts/` was generated: **8 files**, one per critical and high finding (2 critical + 6 high).

| File | Finding |
|---|---|
| `ai-code.if-false-security.inputs_production-ready_scripts___tests___fixtures.e2e.test.ts.55.md` | critical, audit tool's fixture |
| `ai-code.if-false-security.inputs_production-ready_scripts___tests___fixtures.e2e.test.ts.80.md` | critical, audit tool's fixture |
| `owasp.header-missing.strict-transport-security.md` | high, live URL |
| `owasp.header-missing.content-security-policy.md` | high, live URL |
| `logging.pii-leak.tests_browser_harness.js.17.md` | high, test file |
| `ai-code.silent-catch-js.tools_patch-ggwave.js.43.md` | high, build tool |
| `ai-code.silent-catch-js.tools_patch-ggwave.js.70.md` | high, build tool |
| `ai-code.hand-rolled-crypto.tests_orders.test.js.113.md` | high, unit test |

Cautions before handing any of these to a coding agent:

- The two critical prompts tell an agent to edit the audit tool's own test fixture. Acting on them would break the tool's test and change nothing about the site.
- Only the two header prompts address something verified on production. They are fixed at the host or CDN, not in this repo.
- Every prompt embeds the absolute workspace path of this run (`/opt/zouroboros/factory-workspaces/t_b471b49b/.mw-audit-seed`).

The control run produced 7 prompt files (`control-published-tree-only/prompts/`): the same six highs plus `uploads.no-size-limit.md`, the false positive.

## 6. What this audit could not see

Flagged by the run itself:

- **No external scanner ran.** No secret scan of git history, no static analysis, no dependency CVE check, no dynamic scan, no automated accessibility test, no Lighthouse performance or rendered-SEO measurement.
- **Seven domains ran with reduced coverage**: secrets, authentication, accessibility, performance, concurrency, visual-consistency, seo-aeo.
- **66 manual checklist items were emitted; 7 are marked critical and none is signed off** (`--manual-verified` was not passed, correctly). The seven:

| Domain | Critical manual check | Applies here? |
|---|---|---|
| browser-test | Direct-URL access to authenticated routes when logged out | No: there are no authenticated routes |
| concurrency | Double-submit every create/pay/delete action | No: no server-side actions |
| concurrency | Edit the same record in two tabs and save both | No: no shared records |
| visual-consistency | Tab through every control: hover, focus-visible, active, disabled states | Yes, unverified |
| visual-consistency | Render loading, empty, error and success state of every view | Yes, unverified |
| seo-aeo | Verify rendered-vs-raw HTML parity | Yes, unverified |
| seo-aeo | Verify index coverage and canonical in Search Console | Yes, unverified |

  The "Applies here?" column is this report's reading. Many of the other 59 items also assume accounts, a database or payments.

Not flagged by the run, found while checking it:

- **Third-party code shipped to players was not scanned at all.** The tool's file walker skips every directory named `vendor`, so `app/vendor/` (ggwave 0.4.0, zxing-wasm 3.1.6, qrcode-generator 2.0.4) was never read. With osv-scanner absent and no lockfile in the tree, these libraries had no vulnerability check of any kind.
- **The live checks touched the landing page only.** Headers were read from `/` alone. The browser run loaded `/`, checked the title, two viewport widths, same-origin links and console errors, and finished in 1.8 s. The game at `/play/` was present only as an iframe during that load. No match was played, no camera or microphone path was exercised, and nothing was tested on a phone.
- **Some "Full" coverage labels overstate what ran.** OWASP Baseline is printed as "Full" although semgrep, osv-scanner and nuclei were all missing and only five response headers were checked. The rule is that a domain counts as fully covered if any one of its tools ran.
- **Triage dropped one finding about the site.** Of 17 dropped findings, 16 are the tool matching its own rule definitions. The seventeenth is `visual.raw-hex-color-drift` (medium, 31 distinct raw hex colours across 4 files), dropped because its first evidence line, `site/styles.css:2`, sits inside a comment. Triage judges a finding by its first evidence line only. The control run raised the same finding with `spike/spike.css:2` listed first and kept it, so whether it survives depends on file ordering.
- **The run of record is contaminated in both directions** by scanning the audit tool, as section 2 sets out. Its counts and its verdict should not be read as a description of the site without the control run beside them.
- **All repo findings are heuristic.** Every finding in a repo file comes from a regex. Of the 17 findings, only the two SEO lows are marked `verified` by the tool; the two concurrency mediums are marked low-confidence heuristics; the other 13, including all criticals and highs, carry no confidence or verification status.

Checked separately while preparing this report (not part of the tool's output): production serves the committed tree byte for byte. All 10 files under `site/` match what is served at `/`, and all 26 files under `app/` match what is served at `/play/` (sha256). Paths outside those two folders (`tests/`, `tools/`, `package.json`, `README.md`, `inputs/`, `.git/`) return 404. Present on both `/` and `/play/`: `x-content-type-options: nosniff`, `referrer-policy: strict-origin-when-cross-origin`, `permissions-policy: camera=(self), microphone=(self), geolocation=()`.

## Files in this folder

| File | What it is |
|---|---|
| `verdict.json`, `findings.json`, `report.md`, `report.html`, `triage-dropped.json`, `prompts/` | Machine outputs of the run of record, untouched |
| `tooling.json` | Verbatim extract of `findings.json` → `tooling`; the script does not write this file itself |
| `audit-console.txt` | Console transcript and exit code of the run of record |
| `control-published-tree-only/` | Full outputs and transcript of the control run against a clean clone |
| `PRODUCTION-AUDIT.md` | This report |
