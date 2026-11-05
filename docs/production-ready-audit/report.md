# Production-Readiness Audit

**Generated:** 2026-11-05T19:32:27.388Z
**App:** Modem Warfare — two-player offline naval duel game and its landing page
**Repo:** `/opt/zouroboros/factory-workspaces/t_b471b49b/.mw-audit-seed`
**URL:** https://modemwarfare.zouroboros.ai
**Audit duration:** 2.9s

## Verdict — 🔴 Do Not Launch

> 2 hard blocker(s) and/or critical finding(s) detected

| Severity | Count |
|----------|-------|
| 🔴 Critical | 2 |
| 🟠 High | 6 |
| 🟡 Medium | 4 |
| 🔵 Low | 5 |
| ⚪ Info | 0 |

## Coverage

> ⚠️ This audit was **incomplete** — coverage gaps cap the verdict at **Private Beta Only**. A clean result here means "no problems found in what we could inspect", not "safe to launch".

**Coverage gaps:**

- • soft — secrets ran with reduced coverage — ran without gitleaks, trufflehog
- • soft — authentication ran with reduced coverage — ran without semgrep
- • soft — accessibility ran with reduced coverage — ran without @axe-core/cli
- • soft — performance ran with reduced coverage — ran without lighthouse
- • soft — concurrency ran with reduced coverage — static heuristics only; race conditions need runtime confirmation
- • soft — visual-consistency ran with reduced coverage — static drift heuristics; perceptual checks still manual
- • soft — seo-aeo ran with reduced coverage — rendered parity unverified (no lighthouse)
- 🚧 **blocking** — 3 core scanners unavailable (gitleaks, semgrep, osv-scanner) — external verification is largely absent; only in-process heuristics ran
- • soft — 7 critical manual check(s) not signed off — pass --manual-verified after a human confirms them

| Domain | Coverage |
|--------|----------|
| Legal & Data Handling | ✅ Full |
| Secrets & Credential Exposure | 🟡 Partial — ran without gitleaks, trufflehog |
| Authentication & Authorization | 🟡 Partial — ran without semgrep |
| API Route Safety | ✅ Full |
| OWASP Baseline | ✅ Full |
| Abuse, Cost & Rate Limits | ✅ Full |
| Frontend Exposure | ✅ Full |
| Logging & Monitoring | ✅ Full |
| Accessibility | 🟡 Partial — ran without @axe-core/cli |
| Performance & Reliability | 🟡 Partial — ran without lighthouse |
| Payments & Webhooks | ✅ Full |
| File Upload Safety | ✅ Full |
| Database & Data Access | ✅ Full |
| AI-Generated Code Failure Modes | ✅ Full |
| Browser Testing | ✅ Full |
| Concurrency & State Integrity | 🟡 Partial — static heuristics only; race conditions need runtime confirmation |
| Visual Consistency | 🟡 Partial — static drift heuristics; perceptual checks still manual |
| seo-aeo | 🟡 Partial — rendered parity unverified (no lighthouse) |

## 🚨 Hard Blockers — must fix before launch

- **`if False:` around a security check** — ai-code — `ai-code.if-false-security.inputs/production-ready/scripts/__tests__/fixtures.e2e.test.ts.55`
- **`if False:` around a security check** — ai-code — `ai-code.if-false-security.inputs/production-ready/scripts/__tests__/fixtures.e2e.test.ts.80`

## Remediation shape

### ✅ Quick wins (config / one-liners) — 1

- 🔵 **robots.txt declares no sitemap** — `seo-aeo.no-sitemap-reference`

### 🔧 Targeted code changes — 3

- 🟡 **Read-modify-write with no transaction / optimistic lock** — `concurrency.lost-update.inputs/production-ready/scripts/checks/13-database.ts`
- 🟡 **Read-modify-write with no transaction / optimistic lock** — `concurrency.lost-update.inputs/production-ready/scripts/__tests__/audit-calibration.test.ts`
- 🔵 **No JSON-LD structured data detected** — `seo-aeo.missing-jsonld`

## Tooling

| Tool | Available | Version |
|------|-----------|---------|
| `gitleaks` | ❌ | — |
| `trufflehog` | ❌ | — |
| `semgrep` | ❌ | — |
| `osv-scanner` | ❌ | — |
| `trivy` | ❌ | — |
| `lighthouse` | ❌ | — |
| `axe` | ❌ | — |
| `pa11y` | ❌ | — |
| `nuclei` | ❌ | — |

## Findings by domain

### Legal & Data Handling

*Ran in 0.04s with: production-ready:repo-grep*

#### 🟡 No privacy policy page found

*MEDIUM — production-ready:repo-grep*

No file or route resembling a privacy policy was detected. Apps that collect user data need a published, accessible privacy policy.

**Fix:**

Add `/privacy` (or similar) describing what data you collect, why, how long it's retained, third parties it's shared with, and how users can export/delete it.

**References:** <https://gdpr.eu/article-13-notice/>, <https://oag.ca.gov/privacy/ccpa>

#### 🟡 No terms of service found

*MEDIUM — production-ready:repo-grep*

No file or route resembling Terms of Service was detected. Public-facing apps should publish ToS limiting liability and defining acceptable use.

**Fix:**

Add `/terms` covering acceptable use, liability disclaimers, dispute resolution, and termination conditions.

**Manual review for this domain:**

- [ ] List every third party that receives user data (analytics, error reporting, LLM providers, payment processors)
  - *why:* Required for GDPR/CCPA disclosure and Data Processing Agreements.
- [ ] Define data retention windows per data type
  - *why:* Indefinite retention is hostile to user privacy and increases breach blast radius.
- [ ] Verify Data Processing Agreement (DPA) signed with each sub-processor
  - *why:* GDPR Article 28 requires DPAs with processors handling personal data.
- [ ] Cookie banner / consent management is wired (if EU/UK users)
  - *why:* GDPR + ePrivacy Directive require informed consent for non-essential cookies.
- [ ] Privacy policy lists all processors + retention windows + lawful basis
  - *why:* Plain-language disclosure is legally required, not optional.

---

### Secrets & Credential Exposure

*Ran in 0.12s with: none*

> Missing tools: `gitleaks`, `trufflehog`

✅ No findings in this domain.
**Manual review for this domain:**

- [ ] Confirm publishable/anon keys are documented as intentionally-public by the provider
  - *why:* Some 'public' keys are safe to expose (Stripe publishable, Supabase anon); others are not.
- [ ] Verify credential rotation cadence is defined and tested
  - *why:* Even unleaked credentials should be rotated periodically.
- [ ] Check provider audit logs for unexpected access
  - *why:* Past leaks may have been exploited.

---

### Authentication & Authorization

*Ran in 0.05s with: none*

> Missing tools: `semgrep`

✅ No findings in this domain.
**Manual review for this domain:**

- [ ] Test ownership boundaries — sign in as user A, try to access user B's resources via direct URL
  - *why:* BOLA / IDOR is the #1 API vuln per OWASP API Top 10 2023.
- [ ] Verify MFA is available (and required for admin)
  - *why:* Compromised passwords are the most common breach vector.
- [ ] Confirm session timeout + inactivity logout exists
  - *why:* Long-lived sessions on shared/public devices are a leak path.
- [ ] Check rate limit on login + password reset endpoints
  - *why:* Credential stuffing & enumeration require throttling.

---

### API Route Safety

*Ran in 0.06s with: production-ready:repo-grep*

✅ No findings in this domain.
**Manual review for this domain:**

- [ ] Verify every state-changing endpoint requires POST/PUT/PATCH/DELETE (not GET)
  - *why:* GET requests are logged in browser history, referrer headers, and CDN logs.
- [ ] Confirm OpenAPI/Swagger spec exists and matches implementation
  - *why:* Drift between docs and code hides shadow endpoints.
- [ ] Test rate limits return 429 with a Retry-After header
  - *why:* Some implementations silently drop; clients need feedback.

---

### OWASP Baseline

*Ran in 0.15s with: production-ready:headers*

> Missing tools: `semgrep`, `osv-scanner`, `nuclei`

#### 🟠 Security header missing or malformed: strict-transport-security

*HIGH — production-ready:headers*

HSTS — forces HTTPS, prevents downgrade attacks. Header was not set.

**Evidence:**

- `https://modemwarfare.zouroboros.ai`

**Fix:**

Set `strict-transport-security` at your reverse proxy / framework. See `references/tool-reference.md` for production-grade values.

**References:** <https://owasp.org/www-project-secure-headers/>

#### 🟠 Security header missing or malformed: content-security-policy

*HIGH — production-ready:headers*

CSP — defence-in-depth against XSS and data injection. Header was not set.

**Evidence:**

- `https://modemwarfare.zouroboros.ai`

**Fix:**

Set `content-security-policy` at your reverse proxy / framework. See `references/tool-reference.md` for production-grade values.

**References:** <https://owasp.org/www-project-secure-headers/>

**Manual review for this domain:**

- [ ] Threat-model the auth boundary: what does a malicious authenticated user gain access to?
  - *why:* OWASP A04 (Insecure Design) cannot be detected by scanners — needs human judgement.
- [ ] Review every dependency added in the last 6 months for typosquatting / abandoned-maintainer risk
  - *why:* Supply-chain attacks (A08) target recently-added or unmaintained packages.
- [ ] Run a real DAST (ZAP full scan) at least once before launch and after every major release
  - *why:* Static analysis cannot replicate exploit paths.

---

### Abuse, Cost & Rate Limits

*Ran in 0.04s with: production-ready:abuse-grep*

✅ No findings in this domain.
**Manual review for this domain:**

- [ ] Confirm a per-tenant daily/monthly cost cap is enforced at the application layer
  - *why:* Rate limits alone don't prevent a single bad actor from draining a budget within their quota.
- [ ] Bot/CAPTCHA on signup + login + 'forgot password'
  - *why:* Most abuse arrives via cheap-account creation.
- [ ] Billing-anomaly alert wired to ops channel
  - *why:* Catch runaway costs in minutes not days.

---

### Frontend Exposure

*Ran in 0.02s with: production-ready:bundle-scan*

#### 🔵 Internal URL / IP hardcoded in source

*LOW — production-ready:internal-url-grep*

Hard-coded internal hostnames or IPs end up in the production bundle and may reveal architecture details to attackers.

**Evidence:**

- `inputs/production-ready/scripts/checks/15-browser-test.ts:254`
  ```
  return /(localhost|127\.0\.0\.1|:300\d|staging\.|\.local\b|ngrok)/i.test(reque
  ```

**Fix:**

Move URLs to environment-driven config. Verify the build pipeline strips dev-only paths.

**Manual review for this domain:**

- [ ] Open DevTools → Network tab on the production app — is any request going to a dev/staging URL?
  - *why:* AI-generated code commonly leaves mixed-environment URLs after a copy-paste.
- [ ] Check the bundle for comments / console.log statements
  - *why:* Debug output may leak request/response shapes and PII.

---

### Logging & Monitoring

*Ran in 0.03s with: production-ready:logger-grep*

#### 🟠 Sensitive field referenced in a log/print call

*HIGH — production-ready:pii-log-grep*

A log statement appears to include an authorization header, token, password, or API key. Secrets in logs end up in centralized log stores, support tools, and accidentally in screenshots.

**Evidence:**

- `tests/browser/harness.js:17`
  ```
  console.log('session:', summary.session);
  ```

**Fix:**

Use a redaction layer (e.g., pino redact, structlog processors). Log only field names + a hash if you need to correlate. Treat `Authorization`, `Cookie`, `password`, `token`, `secret`, `api_key` as never-loggable.

**References:** <https://owasp.org/Top10/A09_2021-Security_Logging_and_Monitoring_Failures/>

#### 🔵 High volume of ad-hoc log statements (console.log: 152, print: 0)

*LOW — production-ready:log-volume*

AI-generated code routinely leaves debug `console.log` / `print` calls in place. They produce log noise, may leak data, and cost CPU on hot paths.

**Fix:**

Adopt a structured logger (pino, winston, structlog, loguru). Strip / lint console.log in production builds (`no-console` ESLint rule).

**Manual review for this domain:**

- [ ] Verify centralized logs are searchable for at least 7 days
  - *why:* Incidents are often noticed after they end; you need retention to retro.
- [ ] Confirm uptime monitor with on-call paging (StatusCake / BetterStack / Pingdom)
  - *why:* External probe catches what your internal metrics can't.
- [ ] Per-tenant audit trail for: auth events, permission changes, admin actions, data exports
  - *why:* Required for SOC 2 + GDPR + breach forensics.

---

### Accessibility

*Ran in 0.01s with: none*

> Missing tools: `@axe-core/cli`

✅ No findings in this domain.
**Manual review for this domain:**

- [ ] Keyboard-only pass: can you reach every interactive control with Tab? Operate it with Enter/Space?
  - *why:* Automated tools catch ~30–40% of WCAG issues; keyboard ops can't be inferred from DOM.
- [ ] Screen reader smoke test (VoiceOver / NVDA): does the announcement order make sense?
  - *why:* Visually-ordered DOM can confuse screen readers.
- [ ] Reduced motion preference is honored
  - *why:* WCAG 2.3.3 (Animation from Interactions) and motion-disorder users.

---

### Performance & Reliability

*Ran in 0.00s with: none*

> Missing tools: `lighthouse`

✅ No findings in this domain.
**Manual review for this domain:**

- [ ] Tested rollback procedure in staging within last 30 days
  - *why:* An untested rollback is a hope, not a plan.
- [ ] Backups exist AND restore has been tested in last 90 days
  - *why:* Schrödinger's backup: simultaneously exists and doesn't until verified.
- [ ] Capacity tested at ≥ 2× projected peak traffic
  - *why:* Launch traffic spikes are bigger than steady state.
- [ ] Per-route SLOs defined with error budget tracking
  - *why:* Reliability targets without budgets become aspirations.

---

### Payments & Webhooks

*Ran in 0.01s with: none*

✅ No findings in this domain.
**Manual review for this domain:**

- [ ] Confirm app has no money-handling surface
  - *why:* If payments appear later, re-run this check.

---

### File Upload Safety

*Ran in 0.03s with: production-ready:upload-grep*

✅ No findings in this domain.
**Manual review for this domain:**

- [ ] Per-user/tenant storage quota enforced
  - *why:* Otherwise one user can fill your bucket and your bill.
- [ ] Image-processing pipeline does not run untrusted ImageMagick (RCE history)
  - *why:* Prefer sharp / pillow over ImageMagick if possible.
- [ ] Antivirus or sandboxed scanning for executable / archive uploads
  - *why:* Stored files become attack surface for downloaders.

---

### Database & Data Access

*Ran in 0.02s with: production-ready:db-grep*

✅ No findings in this domain.
**Manual review for this domain:**

- [ ] Test backup restore in a scratch environment — actually restore, don't just dump
  - *why:* Backup files aren't backups; restored databases are.
- [ ] Database admin password rotation policy + last rotation date
  - *why:* Long-lived admin creds are a high-value target.
- [ ] Audit log captures: schema changes, role grants, admin queries, data exports
  - *why:* Required for SOC 2 + breach forensics.
- [ ] Confirm migrations are idempotent and tested in CI
  - *why:* AI-generated migrations frequently aren't reversible.

---

### AI-Generated Code Failure Modes

*Ran in 0.08s with: production-ready:ai-heuristics*

#### 🔴 `if False:` around a security check (HARD BLOCKER)

*CRITICAL — production-ready:ai-if-false-security*

Permanent dead-branch around an auth/security check — almost certainly an accidental disable.

**Evidence:**

- `inputs/production-ready/scripts/__tests__/fixtures.e2e.test.ts:55`
  ```
  "    if False:  # bypass admin auth check for now",
  ```

**Fix:**

Remove the dead branch. Re-enable the check.

#### 🔴 `if False:` around a security check (HARD BLOCKER)

*CRITICAL — production-ready:ai-if-false-security*

Permanent dead-branch around an auth/security check — almost certainly an accidental disable.

**Evidence:**

- `inputs/production-ready/scripts/__tests__/fixtures.e2e.test.ts:80`
  ```
  test("`if False:` around an auth check → do-not-launch with a hard blocker", () => {
  ```

**Fix:**

Remove the dead branch. Re-enable the check.

#### 🟠 Empty `catch` swallows errors

*HIGH — production-ready:ai-silent-catch-js*

JS/TS catch block is empty or comment-only — errors disappear.

**Evidence:**

- `tools/patch-ggwave.js:43`
  ```
  e(name);try{Object.defineProperty(body,"name",{value:name})}catch(e){}return body}',
  ```

**Fix:**

Log the error and either rethrow or handle it explicitly.

#### 🟠 Empty `catch` swallows errors

*HIGH — production-ready:ai-silent-catch-js*

JS/TS catch block is empty or comment-only — errors disappear.

**Evidence:**

- `tools/patch-ggwave.js:70`
  ```
  erFunction,"name",{value:makeLegalFunctionName(humanName)})}catch(e){}return invokerFunction}',
  ```

**Fix:**

Log the error and either rethrow or handle it explicitly.

#### 🟠 Weak hash function (MD5/SHA1)

*HIGH — production-ready:ai-hand-rolled-crypto*

MD5 and SHA1 are cryptographically broken. Do not use for passwords, signatures, or integrity.

**Evidence:**

- `tests/orders.test.js:113`
  ```
  const digest = crypto.createHash('md5').update(tag).digest('hex');
  ```

**Fix:**

Use SHA-256+ for hashing, bcrypt/argon2 for passwords, HMAC-SHA256 for signing.

**References:** <https://owasp.org/Top10/A02_2021-Cryptographic_Failures/>

#### 🔵 Type-checker suppression

*LOW — production-ready:ai-type-suppression*

`as any` / `@ts-ignore` / `# type: ignore` silences the type checker without fixing the underlying issue.

**Evidence:**

- `inputs/production-ready/scripts/audit.ts:118`
  ```
  format: (String(values.format) as any) ?? "all",
  ```

**Fix:**

Either fix the underlying type problem or add a justification comment with an issue number to track removal.

**Manual review for this domain:**

- [ ] Diff every AI-generated commit against the previous state — focus on what was REMOVED, not just added
  - *why:* Agents commonly remove security checks during 'fixing' a test or unrelated bug.
- [ ] Spot-check tests by running them in --watch + deliberately breaking the SUT — do the tests fail?
  - *why:* Fake-passing tests reveal themselves when the code they 'test' actually breaks.
- [ ] Inspect every `if NODE_ENV === 'production'` branch — was the security check actually wired in prod?
  - *why:* AI often forgets to remove dev escape hatches.

---

### Browser Testing

*Ran in 1.78s with: playwright*

✅ No findings in this domain.
**Manual review for this domain:**

- [ ] Sign-in, sign-out, and 'forgot password' flow on desktop AND mobile viewport
  - *why:* Most common UX regression after AI-generated changes.
- [ ] **🔒 (gates launch)** Direct-URL access to authenticated routes when logged out — confirms server-side gating
  - *why:* Client-side guards are not enough.
- [ ] Mobile viewport check at 360×640 (iPhone SE size) — tap targets ≥ 44×44px
  - *why:* WCAG 2.5.5 + mobile users are typically your largest cohort.
- [ ] Form validation: try submitting empty, oversized, malformed, and SQL/XSS payloads
  - *why:* Validation gaps surface here that grep misses.
- [ ] Browser back/forward after sensitive actions (delete, purchase) — does state stay consistent?
  - *why:* AI often forgets history.replaceState; back-button reveals stale UI.
- [ ] Open DevTools Network tab during normal use — does any request go to localhost / staging?
  - *why:* Mixed-environment URLs leak through AI copy-paste.
- [ ] Check console for errors and warnings across 5+ representative flows
  - *why:* Production-only errors (e.g., CSP violations) usually surface here first.

---

### Concurrency & State Integrity

*Ran in 0.03s with: production-ready:concurrency-heuristics*

#### 🟡 Read-modify-write with no transaction / optimistic lock

*MEDIUM — production-ready:lost-update · confidence: low · heuristic · Code change*

This module reads a record and later writes it back without any transaction, `SELECT … FOR UPDATE`, or version column. Two concurrent writers can each read the old value and clobber each other — a classic lost update.

**Impact:** Silent data loss under concurrency: balances, counters, and inventory drift when two requests race.

**Evidence:**

- `inputs/production-ready/scripts/checks/13-database.ts:19`
  ```
  String.raw`(?:SELECT\s+[\s\S]{0,200}?\s+FROM|INSERT\s+INTO|UPDATE\s+[\w."'\`]+\s+SET|DELETE\s+FROM)`;
  ```

**Fix:**

Wrap the read-modify-write in a transaction, or use an optimistic-lock version column and retry on conflict, or push the mutation into a single atomic SQL statement (`UPDATE … SET x = x + 1`).

**References:** <https://en.wikipedia.org/wiki/Write%E2%80%93write_conflict>

#### 🟡 Read-modify-write with no transaction / optimistic lock

*MEDIUM — production-ready:lost-update · confidence: low · heuristic · Code change*

This module reads a record and later writes it back without any transaction, `SELECT … FOR UPDATE`, or version column. Two concurrent writers can each read the old value and clobber each other — a classic lost update.

**Impact:** Silent data loss under concurrency: balances, counters, and inventory drift when two requests race.

**Evidence:**

- `inputs/production-ready/scripts/__tests__/audit-calibration.test.ts:31`
  ```
  "const updateRecipe = (recipe: Recipe) => save(recipe);",
  ```

**Fix:**

Wrap the read-modify-write in a transaction, or use an optimistic-lock version column and retry on conflict, or push the mutation into a single atomic SQL statement (`UPDATE … SET x = x + 1`).

**References:** <https://en.wikipedia.org/wiki/Write%E2%80%93write_conflict>

**Manual review for this domain:**

- [ ] **🔒 (gates launch)** Double-submit every create/pay/delete action (click twice fast, and retry on a flaky network) — confirm exactly one side effect
  - *why:* Idempotency and in-flight guards can only be confirmed by exercising the real flow.
- [ ] **🔒 (gates launch)** Open the app in two tabs, edit the same record in both, save both — confirm the second save is rejected or merged, not silently lost
  - *why:* Lost-update / optimistic-lock behaviour is invisible to static analysis.
- [ ] Fire two requests that depend on ordering (e.g. create then immediately update) and confirm out-of-order arrival is handled
  - *why:* Request ordering / race conditions surface only under real latency.
- [ ] Trigger a provider webhook twice with the same event id — confirm the second is a no-op (dedupe by event id)
  - *why:* Webhook redelivery is guaranteed by most providers; duplicate processing corrupts state.
- [ ] Kill the process mid-write (or simulate it) and confirm no partially-written / torn state remains on restart
  - *why:* Atomic-write / crash-consistency guarantees need a fault-injection test.

---

### Visual Consistency

*Ran in 0.01s with: production-ready:visual-heuristics*

✅ No findings in this domain.
**Manual review for this domain:**

- [ ] **🔒 (gates launch)** Tab through every interactive element — confirm hover, focus-visible, active, and disabled states all exist and are distinct
  - *why:* AI-generated components routinely ship only the default state; missing focus rings also fail accessibility.
- [ ] Shrink to 320px and grow to 1440px+ — confirm no horizontal scroll, clipped text, or overlapping elements at any breakpoint
  - *why:* Overflow and breakpoint gaps are perceptual and not detectable by grep.
- [ ] **🔒 (gates launch)** Render the loading, empty, error, and success state of every data view — confirm all four are designed, not just the happy path
  - *why:* Empty/error/loading states are the most commonly missing screens in AI-built UIs.
- [ ] Compare headings, body, and captions across 3+ screens — confirm one consistent type scale, not per-screen font sizes
  - *why:* Typography drift is obvious to users but invisible to static checks.
- [ ] Fill fields with the longest realistic content (long names, long i18n strings, big numbers) — confirm nothing truncates or breaks layout
  - *why:* Localization/content expansion (German, etc.) breaks fixed-width layouts.
- [ ] Spot-check that repeated components (buttons, cards, inputs) use one shared variant, not divergent one-off copies
  - *why:* Component-variant drift accumulates silently across a codebase.

---

### seo-aeo

*Ran in 0.39s with: curl*

> Missing tools: `lighthouse`

#### 🔵 No JSON-LD structured data detected

*LOW — curl/html · confidence: high · verified · Code change · flow: crawl*

No `<script type="application/ld+json">` blocks found. JSON-LD is the recommended format for Schema.org markup. It is not a ranking factor, but valid structured data that matches visible content enables rich results and helps answer engines interpret entities. Do not add schema that does not match the visible page.

**Evidence:**

- `https://modemwarfare.zouroboros.ai` — `0 JSON-LD blocks in <head>`

**Fix:**

If the page represents a clear entity (Article, Product, Organization, FAQ, BreadcrumbList), add matching JSON-LD that mirrors visible content. Validate with the Rich Results Test.

**References:** <https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data>

#### 🔵 robots.txt declares no sitemap

*LOW — curl · confidence: high · verified · Config change · flow: crawl*

No `Sitemap:` directive in robots.txt. Sitemaps are not required, but they help crawlers discover URLs (especially new, isolated, or JS-rendered pages). For multi-page sites, declare at least one.

**Evidence:**

- `https://modemwarfare.zouroboros.ai/robots.txt` — `no Sitemap: directive`

**Fix:**

Generate a sitemap.xml and reference it via `Sitemap: <absolute-url>` in robots.txt. Many frameworks auto-generate this.

**References:** <https://www.sitemaps.org/protocol.html>

**Manual review for this domain:**

- [ ] Decide and document AI-bot policy (training vs search vs user-fetch)
  - *why:* robots.txt has no explicit AI-bot directives, meaning all AI crawlers are allowed by default (per RFC 9309, omission = allow). The owner should consciously decide whether training crawlers (GPTBot, CCBot, ClaudeBot, Google-Extended) are permitted and set directives accordingly. This is a policy decision, not a defect.
- [ ] **🔒 (gates launch)** Verify rendered-vs-raw HTML parity (Lighthouse unavailable)
  - *why:* Lighthouse is not installed, so this audit could not run a headless render. For JS-heavy sites, the raw-curl HTML may differ from what a rendered crawler sees. Manually fetch the page with JS disabled and compare — if title/canonical/content are missing without JS, the site is not reliably indexable.
- [ ] **🔒 (gates launch)** Verify index coverage and canonical selection in Search Console / Bing Webmaster Tools
  - *why:* Automation can detect directives but cannot see actual index status, canonical selection, or crawl frequency. These are observable only in first-party console data. Check the URL Inspection tool for the audit URL.
- [ ] Confirm structured data (if present) matches visible page content
  - *why:* Schema that does not mirror visible content is a spam signal and can trigger manual action. The Rich Results Test validates syntax; only a human can confirm semantic match against the rendered page.

---
