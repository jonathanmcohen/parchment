# Plan F (hygiene) — F2–F6 implementation plan

**Scope:** F2 page-gap thicken · F3 README rewrite (sole README owner for v0.2.0; consumes C's compose-quickstart snippet) · F4 AGPL license · F5 issue templates · F6 PR template  
**Out of scope:** F1 (S3 backup config — separate plan)  
**Branch:** `release/v0.2.0` (or a `feat/f-hygiene` branch off it if F is built before the main release branch is cut)  
**PR:** single PR covering all five tasks (they are purely additive / non-conflicting)

---

## Pre-flight checklist

Before starting any task, verify on the branch:

- [ ] `pnpm lint` passes (`biome check .`)
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes
- [ ] `pnpm build` succeeds

---

## Task F4 — AGPL-3.0 LICENSE file + package.json + version.ts

**Do this first** — subsequent tasks reference the licence; and the About→License link is currently a 404.

### Files touched

| File | Change |
|---|---|
| `LICENSE` (create) | Full AGPL-3.0 text |
| `package.json` | Add `"license": "AGPL-3.0-only"` field |
| `src/lib/version.ts` | Update comment; SPDX identifier comment at top of file |

### Step-by-step

**F4-1. Create `LICENSE` at repo root**

Create `/Users/jon/projects/parchment/LICENSE` with the verbatim AGPL-3.0 text. Use the canonical FSF text (do NOT paraphrase). The file must begin:

```
                    GNU AFFERO GENERAL PUBLIC LICENSE
                       Version 3, 19 November 2007

 Copyright (C) 2007 Free Software Foundation, Inc. <https://fsf.org/>
 Everyone is permitted to copy and distribute verbatim copies
 of this license document, but changing it is not allowed.
```

Full text source: https://www.gnu.org/licenses/agpl-3.0.txt  
The file ends with the "How to Apply These Terms…" section. No copyright line for the project itself is added to the LICENSE file (AGPL-3.0 does not require it in the file body; the repo implicitly owns it).

**F4-2. Edit `package.json`**

Add the `"license"` field between `"private"` and `"type"`:

```json
"private": true,
"license": "AGPL-3.0-only",
"type": "module",
```

The SPDX identifier `AGPL-3.0-only` (not `AGPL-3.0`) is the correct SPDX 3.x expression for "only this version, no later versions". Confirm via https://spdx.org/licenses/AGPL-3.0-only.html.

**F4-3. Update `src/lib/version.ts` comment**

Current comment block (lines 6-9):
```
// repo declares no SPDX license in-tree, so the license line points readers to
// the authoritative LICENSE in the source repository rather than asserting a
// specific identifier here.
```

Replace with:
```
// SPDX-License-Identifier: AGPL-3.0-only
// LICENSE file is at the repo root. The About→License link resolves to that file.
```

The `APP_LICENSE_URL` constant itself (`${APP_REPO_URL}/blob/main/LICENSE`) is correct and does not change — once the LICENSE file is pushed to `main` the URL will resolve. Do not change the URL.

### Verification — F4

- [ ] `ls /path/to/repo/LICENSE` → file exists, first line is the AGPL header
- [ ] `cat package.json | jq '.license'` → `"AGPL-3.0-only"`
- [ ] Live browser: Settings → About → click "LICENSE" link → resolves to GitHub `/blob/main/LICENSE` with the AGPL-3.0 text (must not 404) — verify after the PR is merged to `main`
- [ ] `pnpm lint` passes (biome does not lint the LICENSE file; json lint passes with the new field)

---

## Task F3 — README rewrite

**F3 is the sole README rewrite for the entire v0.2.0 release.** Per §1h of the reconciliation, C does NOT rewrite README; Group C provides a compose-quickstart snippet (the `docker compose up -d` block with the minimal service definitions and required env vars) and F3 incorporates that snippet verbatim. There is exactly ONE `README.md` task for v0.2.0, and it lives here.

### Dependency on Group C

Before writing the Quick start section, obtain the compose-quickstart snippet from Group C's output (the `docker-compose.yml` or the documented minimal snippet). The snippet must cover:

- The `app` + `db` services (or `app` + `db` + `collab` if C ships three services)
- The required env vars from the §4 registry at minimum: `DATABASE_URL`, `PARCHMENT_SECRET_KEY`, `PARCHMENT_VERSION`, `PORT`, `SECURE_COOKIES`
- The `docker compose up -d` invocation followed by "open http://localhost:3000 → /setup wizard"

If C's work has not yet landed on the integration branch when F3 is being written, use a well-formed placeholder that matches the expected compose shape and leave a `<!-- TODO: replace with C's canonical snippet once C merges -->` comment. The placeholder must NOT be a raw `docker run` command — it must be a `docker compose up` workflow even if the exact service names are provisional.

### Goal

Replace the current README.md (202 lines) with a user-first document. The current file has three stale facts:

1. Line 9: `**v0.1** — single-user (owner only).` — v0.2 is multi-user; this section needs updating
2. Line 25: `| Print/PDF | paged.js |` — paged.js was removed in v0.1.9; now uses native `@page` print + `PaginatedDocument`
3. Line 46: `ghcr.io/jonathanmcohen/parchment:v0.1.0` — hardcoded old tag

Additional issues:
- No screenshots or visual hook at the top
- Docker quickstart uses the old all-in-one image (v0.2.0 uses the compose model from C; the quickstart must embed C's snippet)
- Stack table lists `paged.js` which is gone

### Files touched

| File | Change |
|---|---|
| `README.md` | Full rewrite |

### New structure (ordered)

```
# Parchment
<tagline — one sentence>

## What is Parchment?
2-3 sentences: self-hostable Google-Docs-style writing app, markdown-first disk mirror,
real-time collab, multi-user, single compose deployment.

## Screenshots
<!-- placeholder img tags pointing to docs/screenshots/ — note "(screenshots coming soon)"
     if images don't exist yet. Use a visible placeholder comment, not broken img src. -->

## Quick start
<!-- INSERT C's compose-quickstart snippet here (service definitions + env vars).
     Use `docker compose up -d` invocation. Source: Group C's output on the integration branch.
     If C has not merged yet, use a provisional snippet matching the expected compose shape. -->
docker compose up -d  (v0.2.0 compose model — app + db services from C's docker-compose.yml)
Then: open http://localhost:3000 → /setup wizard

## Features
Bullet list: editor (Tiptap/ProseMirror), markdown-first disk mirror, real-time collab
(Yjs+Hocuspocus), multi-user + roles (v0.2+), AI compose (optional), semantic search
(optional), passkeys + MFA, self-hostable (Docker/compose), AGPL-3.0.

## Environment reference
(keep the existing well-maintained table — copy it verbatim, update only the v0.1 single-user
note and the DATABASE_URL default description to match compose model)

## Development
(keep existing dev section; no changes needed)

## Commands
(keep existing table)

## Upgrade
(update the code block to use compose: `docker compose pull && docker compose up -d`
instead of the raw docker run with the hardcoded v0.1.0 tag)

## Stack
(keep table; remove the paged.js row; add row: Print/PDF → native @page + PaginatedDocument)

## Layout
(keep)

## Honesty constraint
(keep)
```

### Step-by-step

**F3-0.** (Prerequisite) Retrieve C's compose-quickstart snippet. Check the integration branch for C's `docker-compose.yml`. Extract the minimal service block (at minimum `app` + `db`) and the env var stanza that C documents as the quickstart. This snippet goes verbatim into the Quick start section of README.md. If C has not yet merged, use a placeholder (see "Dependency on Group C" above) — leave a TODO comment so the integration reviewer knows to replace it.

**F3-1.** Rewrite README.md following the structure above, embedding C's snippet in the Quick start section. Key accuracy rules:
- This is the ONLY README rewrite for v0.2.0. Do not reference any other group's plan producing a README.
- Do not reference paged.js anywhere
- Docker quickstart MUST use `docker compose up -d` with C's actual service definitions (not raw `docker run` with inline Postgres volume)
- Version mentions: use `vX.Y.Z` (with `X.Y.Z` as a placeholder) or `v0.2.0` — do NOT hardcode `v0.1.0`
- License line: `AGPL-3.0-only` (now that F4 adds the file)
- Screenshot section: add a visible HTML comment `<!-- screenshots: add to docs/screenshots/ and update src attributes here -->` in the img placeholder area — do not use broken `<img>` tags with nonexistent paths
- Multi-user note: the intro / "What is Parchment?" must reflect v0.2.0 multi-user support (roles, invite, etc.)

**F3-2.** After writing, do a final stale-fact audit:
- `grep -n "paged.js\|v0\.1\.0\|single-user\|single user" README.md` → must be zero matches
- `grep -n "paged" README.md` → zero matches
- `grep -n "docker run" README.md` → must be zero matches (all deploy instructions use compose)
- `grep -n "APP_SECRET\|SMTP_HOST\|SMTP_PORT" README.md` → must be zero matches (banned env vars per §4)

### Verification — F3

- [ ] `grep -n "paged.js" README.md` → no output
- [ ] `grep -n "v0\.1\.0" README.md` → no output (only `vX.Y.Z` or `v0.2.0` appears)
- [ ] `grep -n "docker run" README.md` → no output (compose only)
- [ ] `grep -n "APP_SECRET\|SMTP_HOST\|SMTP_PORT" README.md` → no output (banned env vars absent)
- [ ] Quickstart block uses `docker compose up -d` with C's service definitions (or a labelled placeholder if C has not merged)
- [ ] Stack table has no `paged.js` row; has `Print/PDF | native @page + PaginatedDocument`
- [ ] README intro mentions multi-user / roles (not "single-user")
- [ ] No other plan's output (C, G, etc.) rewrites README — confirm with `git log --all --oneline -- README.md` that only F's commit touches it
- [ ] `pnpm lint` passes (biome ignores .md, but run it anyway)
- [ ] Render check: paste README into a GitHub Markdown preview or `npx markdown-it README.md` — verify no broken syntax

---

## Task F2 — Word-style bigger page gap

### Current state (all in `src/app/globals.css`)

```
top: -7px;
height: 14px;
```

The band is 14px centred on the seam line.  
Box-shadow on `.parchment-page-boundary`: `0 7px 9px -7px` / `0 -7px 9px -7px`.

### Target state

Thicken the band to ~36px (top: -18px, height: 36px).  
This is a visual tuning decision — the exact value should be verified in-browser.  
The #13 constraint (non-occlusion) must be preserved: `background` stays `color-mix(in srgb, var(--editor-gutter) 62%, transparent)`.

Correspondingly widen the shadow spread to match:
- From: `0 7px 9px -7px` / `0 -7px 9px -7px`
- To: `0 18px 12px -18px` / `0 -18px 12px -18px`

The `pagination.css` real sheets gutter is `gap: 24px` on `.parchment-paged-root`. The continuous-mode band should read visually similar to that 24px gap (a 36px band centred on the seam = 18px above + 18px below, comparable to the 24px physical gap). These values are a first-pass; the implementer must do a browser visual check and may need to nudge ±4px.

### Files touched

| File | Lines (approx) | Change |
|---|---|---|
| `src/app/globals.css` | ~1095–1112 | Three numeric values: `top`, `height`, and both `box-shadow` offset pairs |

### Step-by-step

**F2-1.** In `src/app/globals.css`, locate `.parchment-page[data-page-layout="paged"] .parchment-page-divider::before` (currently line ~1095).

Change:
```css
top: -7px;
height: 14px;
```
to:
```css
top: -18px;
height: 36px;
```

**F2-2.** In the `.parchment-page[data-page-layout="paged"] .parchment-page-boundary` rule (currently line ~1065), change the `box-shadow` offsets:

Change:
```css
box-shadow:
  0 7px 9px -7px color-mix(in srgb, var(--foreground) 30%, transparent),
  0 -7px 9px -7px color-mix(in srgb, var(--foreground) 22%, transparent);
```
to:
```css
box-shadow:
  0 18px 12px -18px color-mix(in srgb, var(--foreground) 30%, transparent),
  0 -18px 12px -18px color-mix(in srgb, var(--foreground) 22%, transparent);
```

**F2-3.** Update the comment that says `/* 14px gutter band centred on the seam line (top:0 of the zero-height divider) */` to read `/* 36px gutter band centred on the seam line (top:0 of the zero-height divider) */`.

### Verification — F2 (BROWSER REQUIRED — computed style probes)

This task has the highest verification bar. The verifier must open the editor in paged mode and run browser DevTools checks:

**Probe 1 — band geometry**
```js
const before = getComputedStyle(
  document.querySelector('.parchment-page-divider'),
  '::before'
)
console.log(before.height)   // must be "36px" (or close to target)
console.log(before.top)      // must be "-18px"
```

**Probe 2 — non-occlusion (the #13 constraint)**
The verifier must visually confirm that a line of text straddling a page seam is still legible through the translucent band. Method: type a long paragraph in paged mode so a line falls exactly at the seam. Inspect that the text is visible through the gutter band (it should show through because `background` is `color-mix … 62%` transparent). A screenshot is sufficient — text must not be completely hidden by an opaque fill.

**Probe 3 — dark page**
Open a document in dark-page mode (`data-page-bg=dark` / dark-page variant). Confirm the gutter band colour is still visible and does not disappear against the dark background. (`--editor-gutter` in dark-page mode should be a dark-ish grey, so the band should still be visible as a slightly different shade.)

**Probe 4 — light mode vs dark mode chrome**
Verify in both `data-color-scheme=light` and `data-color-scheme=dark` that the band is visible and the sheet-edge lines (`border-top`/`border-bottom`) are present.

- [ ] Band height = 36px (computed style)
- [ ] Text straddling seam is legible through band (screenshot evidence)
- [ ] Dark page: gutter band visible
- [ ] Light + dark chrome: band and sheet-edge lines both visible
- [ ] `pnpm lint` passes (no CSS syntax errors)

---

## Task F5 — Issue templates

### Files to create

```
.github/ISSUE_TEMPLATE/config.yml
.github/ISSUE_TEMPLATE/bug-report.yml
.github/ISSUE_TEMPLATE/feature-request.yml
```

### F5-1. `config.yml`

```yaml
blank_issues_enabled: false
contact_links:
  - name: Question / discussion
    url: https://github.com/jonathanmcohen/parchment/discussions
    about: For questions and general discussion, please use GitHub Discussions.
```

`blank_issues_enabled: false` forces contributors through the templates.

### F5-2. `bug-report.yml`

```yaml
name: Bug report
description: File a bug against Parchment
labels: ["bug"]
body:
  - type: markdown
    attributes:
      value: |
        Thanks for taking the time to report a bug. Please fill out the sections below.
  - type: input
    id: version
    attributes:
      label: Parchment version
      description: "Run: Settings → About, or check the image tag. Example: v0.1.11"
      placeholder: "v0.x.y"
    validations:
      required: true
  - type: input
    id: browser
    attributes:
      label: Browser + OS
      placeholder: "e.g. Chrome 126 / macOS 14"
    validations:
      required: true
  - type: textarea
    id: what-happened
    attributes:
      label: What happened?
      description: A clear description of the bug.
    validations:
      required: true
  - type: textarea
    id: expected
    attributes:
      label: What did you expect?
    validations:
      required: true
  - type: textarea
    id: repro
    attributes:
      label: Steps to reproduce
      placeholder: |
        1. Go to …
        2. Click …
        3. See …
    validations:
      required: true
  - type: textarea
    id: logs
    attributes:
      label: Relevant logs or screenshots
      description: Paste browser console errors or attach screenshots.
    validations:
      required: false
  - type: checkboxes
    id: checklist
    attributes:
      label: Pre-submission checklist
      options:
        - label: I have searched open issues and this is not a duplicate.
          required: true
        - label: I am running the latest released version.
          required: false
```

### F5-3. `feature-request.yml`

```yaml
name: Feature request
description: Suggest an improvement or new feature
labels: ["enhancement"]
body:
  - type: markdown
    attributes:
      value: |
        Got an idea? Describe what you'd like to see.
  - type: textarea
    id: problem
    attributes:
      label: What problem does this solve?
      description: Describe the use-case or pain point.
    validations:
      required: true
  - type: textarea
    id: solution
    attributes:
      label: Proposed solution
      description: Describe what you want to happen.
    validations:
      required: true
  - type: textarea
    id: alternatives
    attributes:
      label: Alternatives considered
      description: Have you tried workarounds? Are there other approaches?
    validations:
      required: false
  - type: checkboxes
    id: checklist
    attributes:
      label: Pre-submission checklist
      options:
        - label: I have searched open issues and this is not a duplicate.
          required: true
```

### Verification — F5

- [ ] All three files are valid YAML (`npx js-yaml .github/ISSUE_TEMPLATE/config.yml` / same for others — zero errors)
- [ ] GitHub renders the templates correctly: after merge to `main`, navigate to `https://github.com/jonathanmcohen/parchment/issues/new/choose` — both templates appear and `blank_issues_enabled: false` hides the "Open a blank issue" link
- [ ] `labels` in the YAML match labels that exist in the repo (or GitHub auto-creates them — acceptable)
- [ ] `pnpm lint` passes (biome ignores yaml files; run anyway)

---

## Task F6 — PR template

### File to create

`.github/PULL_REQUEST_TEMPLATE.md`

### Content

```markdown
## Summary

<!-- What does this PR do? Why? Link the spec item (e.g. F4) and any related issues. -->

## Changes

<!-- Bullet list of the key files / behaviours changed. -->

## Test plan

<!-- How did you verify this works? For UI changes: browser steps or computed-style probes.
     For logic changes: unit test name(s) or manual steps.
     For CSS/visual changes: screenshots or DevTools probe output. -->

- [ ] `pnpm lint` passes
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes
- [ ] `pnpm build` succeeds
- [ ] Browser-verified (if UI change): <!-- describe what you checked -->

## Screenshots / probes

<!-- Attach screenshots or paste DevTools output for any visual/CSS change. -->

## Honesty constraint

<!-- No item is "done" until browser-verified. Anything that doesn't ship is logged GAP in scope.md. -->
- [ ] Browser-verified (or marked GAP in scope.md with a reason)

---
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

### Verification — F6

- [ ] File is valid Markdown (renders without broken syntax in GitHub preview)
- [ ] After merge, opening a new PR at `https://github.com/jonathanmcohen/parchment/compare` shows the template pre-filled in the description box
- [ ] The `- [ ]` checklist items render as checkboxes in the GitHub PR UI

---

## Execution order

```
F4 → F3 → F5 → F6 → F2
```

Rationale:
- F4 first: license file must exist before F3 README references it and before the About→License link can be live-verified
- F3 second: README is independent of templates/CSS
- F5 + F6 are independent of each other and can be done in parallel (separate files, no conflicts)
- F2 last: the CSS change is the only one with a browser verification bar; batching it last means CI passes on the static changes first, and the browser probe can be done on the fully-integrated branch

All five tasks can land in a **single PR** — they touch completely different files (CSS, package.json, LICENSE, README.md, .github/).

---

## CI gate

The PR must be green on:

- `biome check .` (lint)
- `tsc --noEmit` (typecheck)
- `vitest run` (unit tests — F2–F6 add no new unit tests; existing tests must stay green)
- `playwright test` (e2e + axe — F2 CSS change is the only risk; paged-mode e2e must pass)
- `pnpm build` (production build)

No new tests are required for F3/F4/F5/F6. F2 has no dedicated unit test — the browser probe described above is the verification gate.

---

## Post-merge live verification

After the PR merges to `main` and the image is published:

1. **F4**: Navigate to `https://github.com/jonathanmcohen/parchment/blob/main/LICENSE` → AGPL-3.0 full text renders (not 404). Then open Settings → About → click LICENSE link → same page.
2. **F3**: Open README on GitHub → no paged.js, no v0.1.0 hardcoded tag, quickstart uses compose.
3. **F5**: Open `https://github.com/jonathanmcohen/parchment/issues/new/choose` → two templates visible, no blank issue option.
4. **F6**: Open a draft PR → description pre-filled with template.
5. **F2**: In the running deploy, open a document in paged mode → run the three DevTools probes above (band 36px, non-occlusion visible, dark page). Record screenshot of the seam with text straddling it.

---

## Task summary

| # | Task | Files created/changed | Decision-free? |
|---|---|---|---|
| F4 | AGPL license | `LICENSE` (new), `package.json`, `src/lib/version.ts` | Yes |
| F3 | README rewrite (sole README owner; consumes C's compose snippet) | `README.md` | Depends on C's compose snippet being available (or a placeholder if C hasn't merged) |
| F5 | Issue templates | 3 new files in `.github/ISSUE_TEMPLATE/` | Yes |
| F6 | PR template | `.github/PULL_REQUEST_TEMPLATE.md` (new) | Yes |
| F2 | Page-gap thicken | `src/app/globals.css` (2 rules, 3 values) | Yes — target ~36px per spec |

**Total tasks: 5. New files: 5. Changed files: 3. Browser probe required: F2 only.**

---

## Unresolved questions

One sequencing dependency (not a design question):

- **F3 depends on C's compose-quickstart snippet.** If Group C has not merged onto the integration branch by the time F3 is being written, use a well-formed provisional `docker compose` block (matching the expected app+db service shape) and mark it with a `<!-- TODO: replace with C's canonical snippet once C merges -->` comment. The integration reviewer must confirm the placeholder was replaced before the PR is approved.

All design decisions are locked per the spec:
- License: AGPL-3.0-only (specified)
- Page-gap target: ~32–40px (specified; implementer picks 36px as midpoint, may nudge ±4px after browser check)
- README structure: user-friendly, compose quickstart (specified; C's snippet is the source)
- Templates: YAML bug + feature + config (specified)
- PR template: markdown (specified)

The only open implementation question is the exact page-gap pixel value, which is intentionally left to browser visual judgment within the 32–40px range. The probe must confirm `height` in that range and the non-occlusion constraint.

---

## F7 — Sidebar stays fixed when the page scrolls (chrome-polish follow-up to v0.1.10 #14)

**Finding (live on the deploy):** `.parchment-sidebar` (AppShell `<aside>`) is `position: static` in normal flow; the WINDOW scrolls, so the sidebar (flex-stretched to full content height, e.g. 2100px) scrolls up with the page — probed `y = -677` at `scrollY 677`; nav + footer scroll out of view.

**Fix (`src/app/globals.css`, desktop rail only):**
```css
@media (min-width: 768px) {
  .parchment-sidebar {
    position: sticky;
    top: 0;
    align-self: flex-start;   /* stop the flex-stretch to full content height */
    height: 100vh;
    overflow-y: auto;         /* tall sidebar (nav + footer) scrolls internally */
  }
}
```
Scoped `>=768px` so the `<768px` slide-in drawer (already `position:fixed` + `translateX`) is untouched. Keeps the window-scroll model, so the v0.1.10 #14 sticky chrome stack stays intact.

**VERIFIED LIVE (inject + scroll probe on the deploy):** after `scrollTo(0,800)`, sidebar `getBoundingClientRect().y` = **0** (pinned; was `-677`), height collapses 2100→**848** (viewport), and `.parchment-chrome-stack` stays pinned at `y=0` (no #14 regression).

**Verify on the built deploy:** scroll a long doc + the /files list → sidebar pinned (nav + footer visible), main content scrolls, #14 chrome still sticky, `<768px` drawer still slides in, light + dark, no main-content layout shift.
