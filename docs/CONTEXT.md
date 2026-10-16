# NGU Type-X Sales Toolkit: context for reviewers

**Repo:** `wheatonlogan/pci-nitrogen-toolkit` · **Railway service:** `nitrogen-toolkit` in project "PCI Hub Demo" · **URL:** https://nitrogen-toolkit-production.up.railway.app · **Version:** 1.7.0 · **Owner:** Logan Wheaton (Marketing, PCI Gases) · **Written:** 16 Oct 2026

This document is for anyone reviewing this app as part of the wider PCI Hub Demo project. It covers four things:

- what the toolkit is for and how it got here
- what it depends on
- what is deliberately unfinished
- where to look hardest

---

## 1. What it is

This is an internal sales tool for PCI Gases' **NGU Type-X membrane nitrogen generator**. A sales rep enters the customer's required nitrogen purity (95–99.5%), flow (55–450 scfm) and feed air pressure. The tool returns:

- **Tab 1, Size a job:** the recommended unit (Type 5–10), part number, feed air required, compressor pairing, and indicative sell price.
- **Tab 2, Payback vs delivered LIN:** a seven-year cumulative cost of the unit against the customer's delivered liquid nitrogen spend, with the payback month.
- **Tab 3, Saved projects:** a project list shared by the whole team, with import and export of the offline JSON file.
- **Print spec sheet:** a one-page record of a sizing for the deal file.

The users are the PCI sales team, roughly a handful to a dozen reps, mostly on laptops. Usage will be light and bursty: a few sizings per rep per week. It is not customer-facing.

## 2. History

| When | What |
|---|---|
| Jun 2025 to Jun 2026 | Several Excel payback calculators and a standalone "NGU vs LIN Payback Calculator" HTML. Sizing used the Evonik SEPURAN tool and PCI's pricing spreadsheet by hand. |
| Sep 2026 | Toolkit v1.0 to v1.6 was built as a **single offline HTML file** for the September 2026 nitrogen sales meeting (a 1.5-hour session; Overview deck v3.1 has 21 slides). It shipped in a "Sales Kit" with START HERE.pdf and a seed `NGU Projects.json`.<br>Saves went to `localStorage`, plus a JSON file written through the File System Access API.<br>202 automated checks covered the model. They lived in build sessions and were never committed anywhere. |
| 22 Sep 2026 | Market stress test. It found that at 135 psig no Type reaches the live projects (Katrium 235 scfm @ 99%, AGI 200 @ 99%), so the real envelope needs 175–200 psig. This is still an open product question; see §7. |
| 25 Sep 2026 | The roadmap was written (Claude Project doc `claude/toolkit-roadmap.md`). Hosting was item 4.1: "if reps actually use this, the save problem is the signal it has outgrown being a file." |
| 16 Oct 2026 | **v1.7, hosted.** The offline file was converted by `scripts/hostify.py` (a one-off, kept as a record). The new pieces are a Hono server, Postgres, a team login, shared projects, a sizing log, the print sheet and the customer-air note.<br>It was deployed to this Railway project the same day. |

### Scope decisions for v1.7 (made by Logan, 16 Oct)

- **In:**
  - hosting behind the login
  - server-side shared projects
  - rep identity
  - sizing log
  - one-page print sheet
  - customer-supplied-air note (roadmap 2.4)
  - committed tests
- **Explicitly cut:**
  - Salesforce `NGU_Spec_Code__c` spec code (roadmap 3.1)
  - installed-cost adder for freight, installation, piping and electrical (2.1)
  - duty-cycle / average-vs-peak input (2.2)
- **Not attempted:**
  - multi-unit sizing (3.3)
  - PSA handoff (3.4)
  - competitor comparison (3.5)
  - US LIN and kWh reference data (2.3)
  - scripted table regeneration (4.2)

## 3. Architecture

```
Browser ── HTTPS ──> nitrogen-toolkit (Node 22, Hono)
                        ├─ GET  /login, POST /login, POST /logout
                        ├─ GET  /              -> public/toolkit.html (signed-in only)
                        ├─ GET  /pci-brand/*   -> brand kit (public: the login page needs it)
                        ├─ /api/me | /api/projects[/:id] | /api/sizing | /api/sizing.csv
                        └─ GET  /healthz       -> SELECT 1
                     └── Postgres-L0eF (DATABASE_URL)
                           ngu_projects · ngu_sizing_events · ngu_meta
```

- **All sizing and payback math runs in the browser**, in the `<script>` block of `public/toolkit.html`. The data tables (`FLOW`, `AF`, `PART`, `COMP`, `P`, `LIM`) are inline. The server never calculates anything. It stores projects and logs events.
- **`toolkit.html` is about 1,900 lines and 190 KB.** Most of that is base64 brand fonts and logos embedded so the original could work offline. The brand-kit CSS is inlined as well. The hosted additions are at the bottom of the script, under the `HOSTED (v1.7)` banner, and in the replaced `loadAll`/`writeAll`/`syncServer`/`reloadProjects` block.
- **Saving works optimistically and keeps a local copy.** The page keeps `PROJ` in memory. `writeAll(list)` diffs it against the previous state and sends `PUT`/`DELETE` requests one after another through a promise chain (`syncChain`). When a write fails, or the server returns 409 for a duplicate name, the page reloads the server list and shows a warning. It never reports a save the server doesn't hold.
- **Drafts stay per-browser.** The current inputs autosave to `localStorage` (`pci.ngu.draft.v1`), so a refresh keeps the rep's place.
- **The sizing log** posts once when the tab-1 inputs settle for 4 seconds on a valid unit (deduped on flow, purity, pressure and air source), and once per save.

### Data model (`src/db.js`, created on start, `CREATE … IF NOT EXISTS`)

| Table | Notes |
|---|---|
| `ngu_projects` | `id` (client-generated text PK), `name` (unique on `lower(name)`), `state` jsonb (the ten tab-1/tab-2 input values), `app_version`, `saved_at` (**client clock**), `saved_by`, `saved_by_email`, `created_at` |
| `ngu_sizing_events` | append-only: rep, rep_email, project, flow, purity, psig, air_by, type, feed air, compressor kW, price, outcome (`sized`/`saved`) |
| `ngu_meta` | `seed_version`, so stock projects are inserted once and deleted ones stay deleted |

There is no migration framework. The schema is idempotent DDL run at boot.

### Auth (`src/auth.js`)

- **Shared password.** One team password, read from `SITE_PASSWORD`, which references the project-level shared variable used by the other PCI apps.
- **Rep identity.** The rep also enters a name and email. Nothing verifies them: they label work, they don't authenticate anyone.
- **Session cookie.** `ngu_session` holds `exp.base64url(json{name,email}).hmac`, signed with `SESSION_SECRET` (HMAC-SHA256, compared in constant time). It is HttpOnly, Secure on Railway and SameSite=Lax, and lasts 30 days.
- **Fails closed.** With no `SITE_PASSWORD`, nobody can sign in.
- **Same pattern as the other apps.** It mirrors `pci-media-library` and `pci-lead-capture`, plus identity. The Hub plan is to replace all three with Microsoft Entra SSO.

## 4. Required resources

| Resource | Detail |
|---|---|
| Railway service | `nitrogen-toolkit` (id `19471ae5-…`), region iad, 1 replica, Railpack, `railway.json` sets the start command, `/healthz` and restart-on-failure. Deploys on every push to `main`. |
| Database | `Postgres-L0eF` (Postgres 18 template, 5 GB volume). **This app uses it alone.** |
| Domain | `nitrogen-toolkit-production.up.railway.app` → port 8080. No custom domain. |
| Variables the app reads | `DATABASE_URL` = `${{Postgres-L0eF.DATABASE_URL}}`, `SITE_PASSWORD` = `${{shared.SITE_PASSWORD}}`, `SESSION_SECRET` (service-level random 64 hex), and optionally `PORT`/`HOST`. |
| Variables present but **unused** | `ANTHROPIC_API_KEY`, `GITHUB_TOKEN`, `GOOGLE_API_KEY`, `MEDIA_LIBRARY_READ_KEY`, `SERPER_API_KEY`. These appeared after deploy, apparently from project-wide shared variables. The app doesn't need them; see §8. |
| Runtime deps | `hono` 4.6.3, `@hono/node-server` 1.13.1, `pg` 8.13.0 (pinned, copied from the media library). |
| Dev/test deps | `playwright-core` 1.56.0 plus a Chromium binary, and a scratch Postgres (`TEST_DATABASE_URL`). |
| No external calls | The server makes no outbound requests. The browser loads only Google Fonts (Roboto), on both the login page and the toolkit; everything else is served from this app. |

## 5. Source data and its provenance

These matter because the tool prints prices and paybacks that reps show customers.

- **Performance** (`FLOW`, `AF`): projected from the **Evonik SEPURAN N2 sizing tool v12.07**, 6″ system (150×1310), at 125 °F / 51.7 °C membrane inlet. The values are interpolated across Evonik's pressure and purity grid and multiplied by membrane count.
  - It reproduces Evonik's worked example (135 psig, 99%) to within 0.1%, and sits within ±5.5% of PCI's pricing-model table.
  - The source workbooks and extracts live on Logan's machine under `Sources of Truth/`. They are not in the repo.
  - **Evonik data-use rights for anything customer-facing are unconfirmed.**
- **Pricing** (`P`, `COMP`): from PCI's `NGU Type X pricing model 09222026.xlsx`. The formula is BOM $50,000, plus $7,800 per membrane, plus 250 h × $35 labour, plus the Elgi compressor cost, all divided by (1 − GP), with a default GP of 30%.
  - **The price excludes freight, installation, piping and electrical.**
  - All of these figures sit in client JavaScript, so any signed-in user can read them.
- **Payback:** simple and undiscounted. NGU running cost is power plus 4% of capital per year for maintenance, and the NGU's own draw is 14 kW (Manual 350337, Table 1-1). There is no LIN price escalation.

## 6. Tests

`npm test` needs `TEST_DATABASE_URL` and finds Chromium on its own (or set `CHROMIUM_PATH`). There are 24 tests, and all of them passed at the v1.7 commit.

- **`auth.test.js` (5 tests):**
  - identity validation
  - session round-trip
  - tamper and expiry rejection
  - no password means no sign-in
- **`api.test.js` (9 tests):**
  - 401s and redirects when signed out
  - login errors
  - seed-once
  - project create, read, update and delete
  - case-insensitive name conflict (409)
  - payload validation
  - sizing log and CSV
- **`toolkit.test.js` (10 tests, headless Chromium against a real server):**
  - the Evonik worked example: 100 scfm at 99% and 135 psig gives Type 6, 451 scfm and 4.51×
  - 135 psig cannot reach Katrium
  - payback against a closed-form crossover
  - the customer-air note
  - cross-rep save, load and delete
  - JSON import
  - sizing-log dedupe
  - the print sheet fits one page and holds the required fields
  - the "not sized" sheet

**Warning: the test helper runs `DROP TABLE IF EXISTS ngu_projects, ngu_sizing_events, ngu_meta`.** Never point `TEST_DATABASE_URL` at production.

The model tests check against independent facts (Evonik's own example, the stress-test finding, closed-form math), not against a restatement of the code. The 202 checks from the offline build are **not** in this repo.

## 7. Open questions that change the numbers (not code issues)

These come from the roadmap (§1) and are product decisions. The tool is precise about a model whose basis is unconfirmed.

1. **135 vs 175 psig spec basis.** The deck says the Type-X specs are at 135 psi. All live projects need 175 psig or more.
2. **The 360 vs 450 scfm ceiling** (Andy Lemen's figure against the package rating the tool enforces).
3. **Membrane inlet basis:** 125 °F vs 100 °F.
4. **Module pressure drop:** 4.6 vs 14.5 psi. The tool uses 4.6, which drives the delivery-pressure warnings.
5. **AHG project numbers** are missing, so it is not seeded.

## 8. Where to look hardest

These are known weak points, listed so the review can confirm, prioritise or reject them.

| Area | Note |
|---|---|
| **Dependencies** | `npm audit` reports **high** advisories for `hono` ≤4.13.6 and `@hono/node-server` ≤1.19.14, including serveStatic path traversal and bypass via repeated or encoded slashes, a CSRF-middleware bypass and cookie-name parsing. This app uses `serveStatic` only for `/pci-brand/*` and doesn't use the CSRF, JWT or IP middleware, but the pins should still be bumped. **The media library uses the same pins.** |
| **Shared secrets on the service** | Five unused shared variables (§4) are injected into this service. Least privilege suggests scoping them to the services that need them. |
| **Authorization** | Any signed-in user can edit or delete any project, read every rep's email through `/api/sizing.csv`, and write arbitrary sizing events. This is acceptable for a small trusted team behind a shared password, but worth confirming. |
| **Login** | No rate limiting or lockout on `POST /login`. One shared password across several PCI apps means one leak exposes all of them. |
| **CSRF** | No tokens. It relies on SameSite=Lax and JSON-only `PUT`/`DELETE`/`POST /api/*`, which cross-site forms can't send with `application/json` without a CORS preflight. Login and logout are form posts, so login CSRF and logout CSRF are theoretically possible (low impact). |
| **XSS** | Project names and rep names are rendered through `esc()` in the toolkit. Check any new rendering path. The CSV export escapes quotes and commas but not leading `=`, `+`, `-` or `@`, which allows **CSV formula injection** when opened in Excel. |
| **Data integrity** | `saved_at` takes the client's clock, so sort order depends on laptops' clocks. Two reps saving the same new name at the same moment: the second gets a 409 and a warning, which is intended. Edits are last-write-wins with no conflict detection on existing projects. |
| **Payload limits** | No body-size limit. `cleanProject` truncates fields, but a large JSON body is still parsed first. |
| **Single large HTML file** | Model, UI, persistence and print logic all live in one inline script. Changes to `FLOW`, `AF` or `P` are hand edits with no regeneration path (roadmap 4.2). |
| **Ops** | No backups configured beyond Railway's defaults. No structured logging or alerting. The health check hits the database, so a DB outage takes the app's health check down with it. |

## 9. Relationship to the rest of the PCI Hub Demo project

| Service | Repo | Shares with this app |
|---|---|---|
| `media-library-app` (+ `Postgres`, bucket `media-library`) | `pci-media-library` | Same stack (Hono, pg, same pinned versions), same login pattern, same brand kit, same `SITE_PASSWORD` |
| `lead-capture-app` (+ `Postgres-3CHs`, bucket `lead-capture`) | `pci-lead-capture` | Same login pattern and brand kit. Its `docs/hub-handoff.md` describes the eventual move into the PCI Hub with Entra SSO. |
| `collateral-app` (volume `collateral-data`) | `pci-collateral-app` | Not examined for this doc |

Each app has its own database. None of them call each other. The planned convergence is one PCI Hub with Microsoft Entra SSO, owned by a separate developer.

## 10. Future plans (from the roadmap, not committed)

1. **Microsoft Entra sign-in** when the app moves into the PCI Hub. Swap `src/auth.js`; `currentUser()` is the only seam.
2. **Settle the §7 questions**, then update the tables in `toolkit.html` and the tests that encode them.
3. **Installed-cost adder** (2.1) and **duty-cycle input** (2.2). These were cut from v1.7 but are the highest-value accuracy changes, because every payback shown today is optimistic.
4. **Salesforce spec code** (3.1) on the Opportunity, for pipeline-wide purity, flow and pressure data.
5. **Regeneration script** (4.2) to rebuild `FLOW`/`AF`/`P` from the Evonik extract and pricing model. This probably means moving the model out of the inline script into a module the server and tests can import.
6. **Multi-unit sizing above 450 scfm** (3.3), **naming the PSA product below 55 scfm** (3.4), **competitor comparison** (3.5), and **US LIN and kWh reference data** (2.3).
