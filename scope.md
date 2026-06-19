# Parchment v0.1.0 — Scope & Audit Tracker

**104 items** across Plans A–L. Single tag `v0.1.0`. This is the source of truth for what shipped.

## Rules

- No item flips to `DONE` until **browser-verified on the live deploy**.
- Every item carries a **Coverage check** and a **Failure-modes-verified** gate before lock.
- If an item does not ship, it is logged `GAP` here with a reason. Never claim done.
- Per-PR artifacts (all five required): spec path · RED-on-main · GREEN-on-branch · live-deploy screenshot · axe-core zero-violations report on affected route.

## Status legend

| Code | Meaning |
|---|---|
| `TODO` | not started |
| `WIP` | in progress |
| `RED` | failing test written, no impl |
| `GREEN` | impl passes tests, not yet browser-verified |
| `DONE` | browser-verified on live deploy + both gates passed + artifacts attached |
| `GAP` | did not ship — reason logged in Notes |

## Gate columns

- **Cov** — Coverage check passed (every sub-behavior in the item has a test).
- **FM** — Failure-modes-verified (error/empty/concurrent/a11y paths exercised).

---

## Plan A — Foundations (5)

| ID | Item | Status | Cov | FM | Notes |
|---|---|---|---|---|---|
| A1 | Scaffold repo, biome, tsconfig, drizzle, **single-container** image (PG18+pgvector+Hocuspocus+Next, s6-overlay) | DONE | ✓ | ✓ | typecheck/lint/build 0; **Vitest+Testcontainers** migration test 3/3; **axe-core 6/6** zero-violations; single-container **browser-verified live** (:3001). a11y contrast bug found+fixed (RED→GREEN) |
| A2 | Auth — PAT + local owner account; OAuth 2.1 + SSO route stubs (v0.2) | DONE | ✓ | ✓ | argon2id + session cookie + Bearer-PAT; /setup + /login; OAuth/SSO 501 stubs; `(app)` gated by requireUser. auth.test green; **browser-verified** owner-creation → session → audit row; axe /login + /setup-form clean |
| A3 | Settings shell — Account / Workspace / Admin / Developer / Notifications / Security | DONE | ✓ | ✓ | 6-group nested-layout shell + active sub-nav; axe 6/6 (fixed inverted active-link contrast, RED→GREEN); browser-verified |
| A4 | Audit log (create/delete/share/export/login) | DONE | ✓ | ✓ | append-only logAudit (never throws) + filterable viewer; Testcontainers test 3/3; **browser-verified** (setup event renders); axe clean |
| A5 | Health page (DB / disk / search index / collab status pills) | DONE | ✓ | ✓ | real probes (db/collab/search-index/disk), resilient; pills page + /api/health; **browser-verified** (db up, collab/disk down shown); axe clean |

## Plan B — Editor core / TIER 1 (14)

| ID | Item | Status | Cov | FM | Notes |
|---|---|---|---|---|---|
| B1 | Page-bounded canvas, `@page` + paged.js, Letter default, A4 toggle, per-section margin+orientation | DONE | ✓ | ✓ | page-width paper + computed break markers + live "Page X · N words" + A4/Letter toggle (816↔794px); paginate unit 15/15; axe clean; browser-verified (3-page overflow, markers, toggle). paged.js print=H2, per-section margins=B14 |
| B2 | Inline formatting bar (B/I/U/S/sub/super/code/highlight/color/font/size/line-height/letter-spacing) | DONE | ✓ | ✓ | fixed top toolbar + selection bubble menu; reactive aria-pressed (useEditorState); onMouseDown keeps selection. marks unit 10/10 (jsdom); axe clean; browser-verified |
| B3 | Block formatting (H1–H6, para, quote, code w/ auto-detect, lists, outlines, align, indent) | TODO | ☐ | ☐ | |
| B4 | Tables — insert/resize/merge/header/shade/sort, `=SUM/AVG/AVERAGE/COUNT`, ranges `A1:A10` | TODO | ☐ | ☐ | |
| B5 | Images — paste/drag/upload, position modes, resize, crop, **alt text required**, lock aspect | TODO | ☐ | ☐ | a11y gate |
| B6 | Links — auto-detect, named, link-to-heading, link-to-doc (fuzzy picker) | TODO | ☐ | ☐ | |
| B7 | Auto TOC — `/toc`, refresh, optional page numbers + leader dots | TODO | ☐ | ☐ | |
| B8 | Footnotes + endnotes — `[^1]`, numbered, click-jump, footer/end per-section | TODO | ☐ | ☐ | |
| B9 | Find + replace — case/word/regex, replace all, scope, ⌘F / ⌘⇧H | TODO | ☐ | ☐ | |
| B10 | Word + char count — live, selection-scoped, reading time | TODO | ☐ | ☐ | |
| B11 | Outline pane — collapsible rail, jump, drag-reorder subtree | TODO | ☐ | ☐ | |
| B12 | Slash menu — `/`, categories BASIC/TEXT/LISTS/MEDIA/EMBED/ADVANCED, category rail | TODO | ☐ | ☐ | |
| B13 | Page primitives — page numbers, running headers/footers per-section, `/pagebreak`, section breaks | TODO | ☐ | ☐ | |
| B14 | Margins + page setup dialog — in/cm, custom margins, orientation, Letter/A4/Legal/Tabloid/Custom | TODO | ☐ | ☐ | |

## Plan C — Code block (7)

| ID | Item | Status | Cov | FM | Notes |
|---|---|---|---|---|---|
| C1 | Code block UI — language picker + auto-detect option | TODO | ☐ | ☐ | |
| C2 | Auto-detect — `highlight.js/lib/core` + `auto`, low-confidence → plaintext | TODO | ☐ | ☐ | |
| C3 | Shiki render — 6 bundled themes, default + per-block override | TODO | ☐ | ☐ | |
| C4 | Top-50 languages, lazy-load grammars by name | TODO | ☐ | ☐ | |
| C5 | Line numbers (per-block toggle), line highlight `{1,3-5}`, filename caption | TODO | ☐ | ☐ | |
| C6 | Copy button + collapse on hover | TODO | ☐ | ☐ | |
| C7 | Diff highlighting for `diff` language | TODO | ☐ | ☐ | |

## Plan D — Collab / review (5)

| ID | Item | Status | Cov | FM | Notes |
|---|---|---|---|---|---|
| D1 | Comment threads — anchor, replies, resolve, @-mention, filter open/resolved/mine | TODO | ☐ | ☐ | |
| D2 | Suggesting mode — tracked insert/delete/format, accept/reject, accept-all, side-by-side, author colors | TODO | ☐ | ☐ | |
| D3 | Version history — autosave 30s + named snapshots, visual + unified-md diff, restore | TODO | ☐ | ☐ | |
| D4 | Real-time multi-cursor + presence (Yjs/Hocuspocus) | TODO | ☐ | ☐ | |
| D5 | Collaborative reading position | TODO | ☐ | ☐ | |

## Plan E — File manager / TIER 4 (11)

| ID | Item | Status | Cov | FM | Notes |
|---|---|---|---|---|---|
| E1 | Folders + nested, drag-drop reparent | TODO | ☐ | ☐ | |
| E2 | Recents / Starred / Shared (stub) / Trash views | TODO | ☐ | ☐ | |
| E3 | Smart folders — live saved searches | TODO | ☐ | ☐ | |
| E4 | Tags — color-coded, picker, filter, bulk tag | TODO | ☐ | ☐ | |
| E5 | Sort + view toggle — name/modified/created/size, grid/list/details + thumbnail | TODO | ☐ | ☐ | |
| E6 | Bulk select — shift/⌘/drag-region, bulk move/tag/delete/export | TODO | ☐ | ☐ | |
| E7 | Right-click menu — rename/move/duplicate/template/star/share/export/open/show/trash | TODO | ☐ | ☐ | |
| E8 | Breadcrumbs — click-jump + drag-drop reparent on hover | TODO | ☐ | ☐ | |
| E9 | Search — tsvector FTS + pgvector semantic, filters, ⌘K hybrid toggle | TODO | ☐ | ☐ | |
| E10 | ⌘P fuzzy file finder | TODO | ☐ | ☐ | |
| E11 | Trash retention — configurable, "empty now" gated by typed confirm | TODO | ☐ | ☐ | |

## Plan F — Disk mirror / TIER 3 (6)

| ID | Item | Status | Cov | FM | Notes |
|---|---|---|---|---|---|
| F1 | Every doc → real `.md` under `~/parchment/files/<folder>/<file>.md`, configurable root | TODO | ☐ | ☐ | |
| F2 | chokidar watcher — external edits sync back, conflict detect | TODO | ☐ | ☐ | |
| F3 | Markdown canonical form — lossless, extension blocks as fenced `parchment:*` | TODO | ☐ | ☐ | |
| F4 | Per-doc git via isomorphic-git — autocommit, log, cherry-pick, branch, merge | TODO | ☐ | ☐ | |
| F5 | Plain-text unified diff alongside visual diff (ties D3) | TODO | ☐ | ☐ | |
| F6 | `[[doc-name]]` wiki backlinks + autocomplete + backlinks panel | TODO | ☐ | ☐ | |

## Plan G — Tiers 2–8 (17)

| ID | Item | Status | Cov | FM | Notes |
|---|---|---|---|---|---|
| G1 | Sharing — link share (view/comment/edit/suggest), per-email (stub), password, expiry, anyone-toggle | TODO | ☐ | ☐ | v0.2 grants stubbed |
| G2 | Templates — bundled gallery + save-as-template | TODO | ☐ | ☐ | |
| G3 | Styles system — named para/char styles, inherit chain, workspace CSS theme, accent, font pairs | TODO | ☐ | ☐ | |
| G4 | Equation editor — KaTeX inline/display, numbering, eq refs | TODO | ☐ | ☐ | |
| G5 | Drawing — Excalidraw embed, SVG out, editable on reopen | TODO | ☐ | ☐ | |
| G6 | Diagrams — Mermaid + PlantUML + Drawio, live preview | TODO | ☐ | ☐ | |
| G7 | Citations — DOI via CrossRef, CSL (APA/MLA/Chicago), bibliography block, cite-by-key | TODO | ☐ | ☐ | reuse Cairn lib |
| G8 | Cross-references — figure/table/eq/heading, auto-update on move | TODO | ☐ | ☐ | |
| G9 | Watermark — text/image, per-doc or per-section | TODO | ☐ | ☐ | |
| G10 | Voice typing — Web Speech API into selection | TODO | ☐ | ☐ | |
| G11 | PWA / offline — SW cache, offline edit, sync on reconnect | TODO | ☐ | ☐ | |
| G12 | Mobile responsive editor — touch toolbar, page-fit, swipe pages | TODO | ☐ | ☐ | |
| G13 | AI compose sleeve — Ollama/Anthropic/OpenAI, improve/shorten/translate/continue → suggesting mode | TODO | ☐ | ☐ | Ollama fallback `homelab:11434` |
| G14 | Smart paste — content-type sniffer → Word/GDocs/Notion/web/markdown normalisers | TODO | ☐ | ☐ | |
| G15 | Reading mode — full-bleed, sepia/serif/wide-margin, per-doc bookmark | TODO | ☐ | ☐ | |
| G16 | Presenter mode — F5 page-flip, arrows, speaker notes | TODO | ☐ | ☐ | |
| G17 | Custom CSS per doc | TODO | ☐ | ☐ | |

## Plan H — Export / import / TIER 5 (9)

| ID | Item | Status | Cov | FM | Notes |
|---|---|---|---|---|---|
| H1 | `.docx` round-trip via Mammoth | TODO | ☐ | ☐ | |
| H2 | `.pdf` via paged.js (page fidelity) | TODO | ☐ | ☐ | |
| H3 | `.html` standalone, embedded CSS, no JS | TODO | ☐ | ☐ | |
| H4 | `.md` canonical lossless round-trip | TODO | ☐ | ☐ | |
| H5 | `.epub` long-form | TODO | ☐ | ☐ | |
| H6 | LaTeX — equation + bibliography preserved | TODO | ☐ | ☐ | |
| H7 | plain `.txt` | TODO | ☐ | ☐ | |
| H8 | Bulk export — multi-select → ZIP in chosen format | TODO | ☐ | ☐ | |
| H9 | Import — docx/md/html/Notion-zip/Google-Docs-paste | TODO | ☐ | ☐ | |

## Plan I — Settings / admin / ops / TIER 6 (10)

| ID | Item | Status | Cov | FM | Notes |
|---|---|---|---|---|---|
| I1 | Theme — light/dark/system, accent picker, page bg, font-pair gallery | TODO | ☐ | ☐ | |
| I2 | Keyboard shortcuts — ⌘⇧/ cheat sheet, customizable, Vim source mode | TODO | ☐ | ☐ | |
| I3 | Autosave cadence slider 5s–5min | TODO | ☐ | ☐ | |
| I4 | Backup — workspace .zip, scheduled S3 (Cairn CFG-2 pattern), restore | TODO | ☐ | ☐ | |
| I5 | Audit log (= A4) | TODO | ☐ | ☐ | shared with A4 |
| I6 | Health page (= A5) + Ollama + S3 pills | TODO | ☐ | ☐ | shared with A5 |
| I7 | MFA + passkeys (reuse Cairn lib) | TODO | ☐ | ☐ | |
| I8 | SSO / SCIM route stubs (v0.2) | TODO | ☐ | ☐ | |
| I9 | Help menu — replay tour / shortcuts / what's new drawer | TODO | ☐ | ☐ | |
| I10 | Schedules — in-process scheduler **on-by-default, NO env flag** (avoid Cairn CFG-3) | TODO | ☐ | ☐ | |

## Plan J — Integrations / TIER 7 (7)

| ID | Item | Status | Cov | FM | Notes |
|---|---|---|---|---|---|
| J1 | Cairn cross-link — `[[cairn://page-id]]`, preview card, bidirectional | TODO | ☐ | ☐ | |
| J2 | Calendar embed — read-only iCal iframe | TODO | ☐ | ☐ | |
| J3 | Spreadsheet embed — GSheets/Cairn-db/Airtable iframe | TODO | ☐ | ☐ | |
| J4 | Slack / Discord — share to channel, notify on comment | TODO | ☐ | ☐ | |
| J5 | Email-in — per-doc address, SMTP relay replies → comments | TODO | ☐ | ☐ | |
| J6 | GitHub — embed PR/issue with live status | TODO | ☐ | ☐ | |
| J7 | Webhooks — save/publish/comment, HMAC-signed | TODO | ☐ | ☐ | |

## Plan K — Accessibility + i18n / TIER 8 (7)

| ID | Item | Status | Cov | FM | Notes |
|---|---|---|---|---|---|
| K1 | ARIA structure, semantic HTML, alt text required on insert | TODO | ☐ | ☐ | ties B5 |
| K2 | High-contrast theme + OpenDyslexic toggle | TODO | ☐ | ☐ | |
| K3 | Keyboard-only nav — every menu, focus ring, skip-to-content | TODO | ☐ | ☐ | |
| K4 | axe-core harness — every top-level page a Playwright a11y target | WIP | ☐ | ☐ | harness live (Playwright + @axe-core), 6 routes green; extends as routes are added |
| K5 | i18n via next-intl + RTL (Arabic/Hebrew) | TODO | ☐ | ☐ | |
| K6 | Spell check — browser-native + per-workspace custom dict | TODO | ☐ | ☐ | |
| K7 | Grammar check — LanguageTool (host URL + key UI) | TODO | ☐ | ☐ | |

## Plan L — Release / CI / docs (6)

| ID | Item | Status | Cov | FM | Notes |
|---|---|---|---|---|---|
| L1 | Multi-arch Docker `ghcr.io/jonathanmcohen/parchment:v0.1.0` (amd64 + arm64) | TODO | ☐ | ☐ | |
| L2 | GH Actions release pipeline — `release.yml`, `verify-carry-forward-closed`, tag gated on green e2e+a11y | TODO | ☐ | ☐ | mirror Cairn |
| L3 | `release/v0.1.0` integration branch — per-item PR squash → tag → publish; **keep branch** (no cleanup) | TODO | ☐ | ☐ | user: keep old release branch |
| L4 | README — install, env, commands, upgrade | TODO | ☐ | ☐ | |
| L5 | In-app "What's new in v0.1.0" release notes page | TODO | ☐ | ☐ | |
| L6 | Parchment Guide workspace seed — per-feature page tree + release-notes parent | TODO | ☐ | ☐ | |

---

## Roll-up

| Plan | Items | DONE | GAP | Open |
|---|---|---|---|---|
| A Foundations | 5 | 5 | 0 | 0 |
| B Editor core | 14 | 2 | 0 | 12 |
| C Code block | 7 | 0 | 0 | 7 |
| D Collab | 5 | 0 | 0 | 5 |
| E File manager | 11 | 0 | 0 | 11 |
| F Disk mirror | 6 | 0 | 0 | 6 |
| G Tiers 2–8 | 17 | 0 | 0 | 17 |
| H Export/import | 9 | 0 | 0 | 9 |
| I Settings/ops | 10 | 0 | 0 | 10 |
| J Integrations | 7 | 0 | 0 | 7 |
| K A11y/i18n | 7 | 0 | 0 | 7 |
| L Release/CI | 6 | 0 | 0 | 6 |
| **Total** | **104** | **7** | **0** | **97** |

Shared items (one impl, tracked twice): A4≡I5, A5≡I6, B5↔K1, D3↔F5.
