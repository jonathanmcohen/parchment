# v0.2.0 — Group J: Content / Editor / Search / API

**Status when this plan was written:** Group J is mostly **gap-fill / polish on shipped infrastructure**, NOT greenfield. The investigation below was done against the real repo (`/Users/jon/projects/parchment`), correcting an earlier brief that assumed most of J was unbuilt.

## Ground truth (verified on disk — read these before starting any task)

| Sub-feature | State | Evidence |
|---|---|---|
| J1 upload backend | **EXISTS, partial** | `src/app/api/docs/[id]/assets/route.ts` (POST, 10 MB, allowed-types, owner-check, writes to `${filesRoot}/.assets/<id>/<uuid>.<ext>`) + `[file]/route.ts` (GET, path-traversal guard). **Gaps:** images-only (no PDF/attachments), disk-only (no S3), assets live in `.assets/<id>/` NOT alongside the `.md` (locked decision says alongside), served only through owner auth (share-viewer can't load them), no per-user quota tie-in. |
| J2 tags / smart folders | **EXISTS** | tables `tags`,`documentTags`,`smartFolders` (`src/db/schema.ts`); `/api/tags`,`/api/tags/[id]`,`/api/tags/[id]/results`,`/api/smart-folders/*`; repos `tags-repo.ts`,`smart-folders-repo.ts`,`smart-folder-criteria.ts`,`tag-colors.ts`; FileManager `view='tag'|'smart'`. **Gaps:** tag CRUD/recolor UI polish, smart-folder criteria coverage (only `titleContains`/`folderId`/`starred` today — `describeCriteria`/`parseCriteria`), tag-on-create. |
| J3 templates gallery | **EXISTS** | `/templates` page (`src/app/(app)/templates/page.tsx`), `TemplateGallery.tsx`, `/api/templates`, `/api/docs/from-template` (builtin + user), `builtin-templates.ts`, `templates` table. **Gaps:** preview, categories, save-current-doc-as-template UI, more bundled templates. |
| J4 semantic search | **EXISTS, fully wired** | `src/lib/search/embeddings.ts` (`isSemanticEnabled()` gates on `EMBEDDINGS_URL`; `embed()` → OpenAI-compatible endpoint; dim **768**); `search-repo.ts` `searchSemantic` (cosine `<=>`, HNSW idx) + `searchFullText` (tsvector, `websearch_to_tsquery`); `/api/search?q=&mode=keyword|semantic` with graceful FTS fallback; **embeddings written on every save** in `repo.ts` `saveDocument` (best-effort). **Embedding source = external OpenAI-compatible endpoint, already wired.** **Gaps:** UI surfacing (CommandPalette has no semantic toggle), backfill of existing docs, result UX. |
| J5 backlinks | **EXISTS, no UI** | `/api/docs/[id]/backlinks`, `doc-links-repo.ts` (`backlinks()`), `doc-links.ts` (`extractTargetIds`), `docLinks` table, `extensions/wiki-link.ts`+`wiki-suggestion.ts`, indexed on save. **Gaps:** backlinks PANEL in the editor, GRAPH view (none exists). |
| J6 search operators | **partial** | FTS uses `websearch_to_tsquery` (handles quotes/`-`/OR natively). **Gaps:** structured operators (`tag:`,`folder:`,`is:starred`,`title:`,`before:`/`after:`) parsed client/route-side into `SearchFilters`. |
| J7 import md+docx | **EXISTS, over-scoped** | `/api/docs/import` (25 MB, type detect, 200-with-warnings), `src/lib/import/index.ts` (md/html/docx via mammoth+turndown+jsdom / notion-zip), `markdownToJson`. **Locked decision: md + docx ONLY.** **Gaps:** strip/hide notion-zip+html paths from the user-facing flow (keep code or gate), import UI entry point, round-trip + fidelity tests, image extraction from docx. |
| J8 REST API + scoped tokens | **EXISTS unscoped** | `pats` table (no scope column), `src/lib/auth/pat.ts` (`issuePat`/`verifyPat`/`revokePat`/`listPats`), `/api/auth/pat`, `guard.ts` `authenticateRequest` accepts `Bearer pat_…` for **every** route, `PATManager.tsx` + `settings/developer/page.tsx`. **Gaps:** token SCOPES (read/write) — there is no scoping today, a PAT is full-access; documented stable REST surface; scope enforcement in the guard. |
| J9 CLI | **DOES NOT EXIST** | No `bin/`, no `package.json#bin`, no `cli.ts`. Greenfield. |
| J10 focus/zen + writing goals | **partial / new** | `src/lib/editor/counts.ts` (`countText`,`readingTimeMinutes`), `WordCountDialog.tsx`. **No focus/zen mode, no writing-goal/word-target.** New UI + state. |
| J11 bulk ops + trash retention | **EXISTS** | `/api/docs/bulk` (move/trash/tag), `/api/settings/trash-retention` + `settings-repo` + purge job, `/api/trash/empty`, FileManager `BulkBar` + `view='trash'`. **Gaps:** bulk **delete-forever / restore** actions, retention-policy settings UI, trash list polish. |
| J12 custom CSS / per-doc theme + more themes | **partial** | `/api/docs/[id]/custom-css` + `custom-css.ts` (sanitize+scope at render, `.parchment-custom-scope`), `StylesManager.tsx`, `/api/settings/styles`. Theme tokens in `src/styles/tokens.css` (light/dark/system + HC). **Gaps:** per-doc THEME override (vs only CSS), more bundled themes, workspace-level custom CSS surfacing. |

### Reusable building blocks (do NOT reinvent)
- **S3:** `src/lib/backup/s3.ts` — `isS3Configured()`, `uploadToS3(key, body, contentType)`, env `BACKUP_S3_ENDPOINT/BUCKET/ACCESS_KEY_ID/SECRET_ACCESS_KEY`, `forcePathStyle:true` (MinIO/R2/AWS). J1 S3 **reuses this exact config namespace** (`BACKUP_S3_*`) — no new `ASSETS_S3_*` env set. Add a `getObject` sibling and use an `assets/`-prefixed key to separate asset objects from backup objects within the same bucket. (Rationale: the canonical env registry §4 lists `BACKUP_S3_*` only; introducing a second S3 namespace doubles operator config burden for what is the same underlying store. If a deployer truly wants a separate bucket, they mount different env values at the same `BACKUP_S3_*` keys via e.g. compose profiles — document that pattern instead.)
- **Disk mirror:** `src/lib/disk/mirror.ts` — `absPath`, `syncDocToDisk`, `docRelPath`. J1's "alongside the .md" decision means assets must follow the doc's `disk_path` folder, not a flat `.assets/<id>`.
- **Auth guard:** `src/lib/auth/guard.ts` `authenticateRequest`. J8 scoping hooks here.
- **Markdown round-trip:** `src/lib/markdown/parse.ts#markdownToJson` ↔ `serialize.ts#serializeMarkdown`. Round-trip tests for J7 anchor on these.
- **Counts:** `src/lib/editor/counts.ts`. J10 goals build on this.

---

## Working agreements (apply to EVERY task)

1. **TDD, no exceptions.** Write the failing test first (RED), implement (GREEN), refactor. Parsers (J6 operators, J7 import, J8 scope-matcher), upload validators (J1), and ranking (J4/J6) are pure-function-first: extract logic into a unit-testable module, then wire the route to it.
2. **Read-the-file-first.** Each task names the exact file(s). Read them (and their existing tests in `tests/unit/`) before editing. Existing tests to mirror: `import.test.ts`, `embeddings.test.ts`, `embed-providers.test.ts`, `custom-css.test.ts`, `tag-colors.test.ts`, `recovery-search.test.ts`, `bulk-export.test.ts`, `builtin-templates.test.ts`, `disk-paths.test.ts`.
3. **No placeholders / no stubs / no TODO-laden merges.** A task is done only when its tests pass AND (for UI) a browser DOM probe confirms behavior.
4. **Browser verification = DOM probes, NOT screenshots.** Deploy screenshots are stale. Use the local dev server + `mcp__Claude_Preview__preview_eval` / `preview_inspect` to assert on DOM/state. Each UI task lists its probe.
5. **Security review is a gate, not a nicety.** J1 (uploads) and J8 (API/tokens) MUST get an adversarial review (path traversal, SSRF, content-type spoofing, scope bypass, IDOR) before merge. Use the `security-review` skill on the diff.
6. **Authorization via canonical module.** For doc access decisions import `authorizeDocRoute` / `getDocAccess` from `@/lib/authz/doc-access` (§1c of the reconciliation). The raw `doc.ownerId !== user.id ⇒ 404` pattern is retained only at the IDOR-guard level (existence oracle) — it is NOT a substitute for the authz capability check, which also handles shared-edit grants, share tokens, and future role expansion. Both layers must be present on upload/asset routes.
7. **`bun`/`pnpm` discipline:** `pnpm test` (vitest), `pnpm typecheck`, `pnpm lint` (`biome check .`) all green before a task is "done". Lint runs repo-wide — remove any worktree `biome.json` before checking.
8. **Best-effort side-effects never break the critical path** (matches `saveDocument`): embeddings, disk-sync, webhooks are `void`-dispatched and swallow errors.

---

## J1 — Upload / attachment storage  *(EXISTS partial → extend)*

**Goal:** attachments (images **and** files like PDF) stored on **disk alongside the `.md`** by default, **S3 optional** (reuse S3 config), served to authorized viewers including share links, with hardened validation.

### J1-0 — Decision spike (write findings into this file, no code)
- Resolve: (a) asset key layout — alongside the doc's `disk_path` (locked) vs the current flat `.assets/<id>/`; propose a `<docDir>/<docbase>.assets/` sibling folder so a moved/renamed doc relocates its assets via `syncDocToDisk`. Determine whether a `documents` schema column is needed to record the new layout (if yes, this column lands in migration **0027**). (b) S3 config: **mandate `BACKUP_S3_*` reuse** (canonical per §4 of the reconciliation — no new `ASSETS_S3_*` env set; use an `assets/`-prefixed key within the same bucket). (c) share-viewer asset auth: use `getDocAccess` from `@/lib/authz/doc-access` (canonical §1c) to check `canView` before serving — do NOT implement a bespoke share/token auth path here. **Output: a short ADR block appended below this task.** Blocks J1-1..J1-7.

### J1-1 — Upload validator module *(pure, TDD)* — NEW FILE
- File: `src/lib/uploads/validate.ts`. Functions: `classifyUpload({name, type, size})` → `{ ok, kind:'image'|'file', ext, error? }`; `MAX_IMAGE_BYTES`, `MAX_FILE_BYTES`; allow-list for images (current set) + files (`application/pdf`, `text/plain`, `text/csv`, common office). **Magic-byte sniff** for images/pdf (do not trust `file.type` alone).
- Test: `tests/unit/uploads-validate.test.ts` — rejects `image/svg+xml` with `<script>` payload (or strips/flags it), rejects oversize, rejects mismatched magic-bytes vs extension, accepts valid png/jpg/pdf, normalizes double extensions (`x.php.png`).

### J1-2 — Asset path resolver *(pure, TDD)* — NEW FILE
- File: `src/lib/uploads/asset-path.ts`. `assetRelPath(doc, filename)` → path alongside the doc's mirror; `safeAssetName(name)` → uuid+ext, never echoes user filename into the path. Reuse `disk/mirror.ts` helpers.
- Test: `tests/unit/asset-path.test.ts` — traversal inputs (`../`, absolute, `..\\`, null-byte, unicode dot-dot) all neutralized; output always inside `filesRoot`.

### J1-3 — Storage adapter *(TDD with a fake fs/S3)* — NEW FILE
- File: `src/lib/uploads/store.ts`. `putAsset(doc, name, bytes, contentType)` and `getAsset(doc, name)` dispatch disk vs S3 by `isS3Configured()` (imported from `src/lib/backup/s3.ts` — no separate `isAssetsS3Configured`). S3 keys use an `assets/`-prefixed path within the `BACKUP_S3_*` bucket. Disk path uses `mkdir -p` + `writeFile`; S3 path uses the shared `uploadToS3` / new `getObject` sibling.
- Test: `tests/unit/uploads-store.test.ts` — disk write lands at the resolved path; S3 branch calls `uploadToS3` with the right key (mock); `getAsset` 404s a missing key without throwing.

### J1-4 — Rewire POST `/api/docs/[id]/assets` — EDIT
- File: `src/app/api/docs/[id]/assets/route.ts`. Replace inline validation with J1-1; accept files (not just images); call J1-3; return `{ url, kind }`. Authorization: use `authorizeDocRoute(user, docId, 'edit')` from `@/lib/authz/doc-access` (canonical §1c) — this subsumes the raw `ownerId !== user.id` check and covers future shared-edit grants. Keep 10/25 MB caps (image vs file). Tie into per-user quota if J-I2 lands (guard behind a feature-flag if not).
- Test: route-level vitest (mirror existing route tests) — 401 unauth, 404 not-owner, 400 bad type, 413 oversize, 201 success returns a URL under `/api/docs/<id>/assets/`.

### J1-5 — Rewire GET `/api/docs/[id]/assets/[file]` + share-viewer access — EDIT
- File: `src/app/api/docs/[id]/assets/[file]/route.ts`. Serve via J1-3; **add share-viewer read path** using `getDocAccess({user?, shareGrant?}, docId)` from `@/lib/authz/doc-access` (canonical §1c — do NOT reuse a private `share/[token]` helper here). Pass `shareGrant` if a share token is present in the request, `user` if authenticated. Deny if `!canView`. Keep the path-traversal guard (already present) and add content-type from the validator map. Set `Content-Disposition: inline` for images, `attachment` for files.
- Test: traversal still blocked; owner GET 200; share-token GET 200; random token 404.

### J1-6 — Editor + dialogs accept files — EDIT
- Files: `src/components/editor/Editor.tsx` (paste/drop already image-only at lines ~926–960 — extend drop to upload non-image files as link/attachment nodes), `ImageDialog.tsx`, `CropDialog.tsx` (unchanged URL, already hit `/assets`). Add an "attach file" slash item / toolbar action that uploads then inserts a download link.
- Browser probe: `preview_eval` — programmatically dispatch a drop with a small PDF blob; assert a link node with the returned `/assets/…` href appears in the doc JSON; assert an image drop still routes through `ImageDialog` (alt-text gate intact).

### J1-7 — Security review (GATE)
- Run `security-review` on the J1 diff. Checklist: SVG XSS (served `inline`?), content-type spoof, traversal (route + resolver), SSRF via S3 endpoint, IDOR (share path), zip-bomb N/A here, quota DoS, symlink escape on disk. No findings ⇒ done.

---

## J2 — Tags / labels + smart folders  *(EXISTS → gap-fill)*

### J2-1 — Smart-folder criteria coverage *(pure, TDD)* — EDIT
- File: `src/lib/docs/smart-folder-criteria.ts`. Extend `SmartCriteria`/`parseCriteria`/`describeCriteria` with `tagId`, `updatedWithinDays`, `hasAttachments`(if J1 metadata exists). Keep "never throws / coerce" contract.
- Test: extend the criteria test — each new field parses, bad types coerce/omit, `describeCriteria` renders human text.

### J2-2 — Smart-folder results honor new criteria — EDIT
- File: `src/lib/docs/smart-folders-repo.ts` + `/api/smart-folders/[id]/results`. Translate new criteria into the query (reuse `search-repo` filter style).
- Test: repo test seeds docs and asserts a `tagId`+`updatedWithinDays` smart folder returns exactly the matching set.

### J2-3 — Tag management UI polish — EDIT
- Files: tag UI in `src/components/file-manager/*` (TagPopover lives in the file-manager surface) + `tag-colors.ts`. Add rename/recolor/delete + tag-on-create. Reuse existing `/api/tags/[id]` (PATCH/DELETE).
- Browser probe: `preview_eval` — create tag, recolor, assert the chip's computed color class updates; delete and assert it leaves the doc's tag list.

---

## J3 — Templates gallery  *(EXISTS → gap-fill)*

### J3-1 — "Save current doc as template" — EDIT
- Files: `TemplateGallery.tsx` or a new menu action in `src/components/shell/NewMenu.tsx`; POST `/api/templates` with the active doc's PM JSON. (Route + table already exist.)
- Test: route test — POST stores a template owner-scoped; from-template instantiates it.
- Browser probe: from the editor, trigger save-as-template; reload `/templates`; assert the new card renders.

### J3-2 — Gallery preview + categories — EDIT
- Files: `TemplateGallery.tsx`, `builtin-templates.ts` (add a `category` field + a few more bundled templates: meeting-notes, PRD, weekly-review, blog-post). Render category sections + a read-only preview (render PM JSON via the existing read-only renderer).
- Browser probe: assert category headings exist; assert preview panel shows non-empty rendered content for a builtin.

---

## J4 — Semantic search  *(EXISTS fully wired → surface + polish)*

### J4-1 — Search-mode UI in the command palette — EDIT
- Files: `src/components/CommandPalette.tsx` (+ `CommandPaletteMount.tsx`). Add a keyword/semantic toggle that is **only shown when `semanticEnabled`** (read from `/api/search` response). Call `/api/search?mode=semantic` and render ranked results with the `preview`.
- Browser probe: with `EMBEDDINGS_URL` unset, assert the toggle is hidden and search still returns FTS results; (optional, gated) with a stub endpoint set, assert mode=semantic hits the semantic path. **Do NOT require a live embeddings endpoint for CI** — stub `embed` in tests.

### J4-2 — Embedding backfill command/job — NEW
- File: `src/lib/search/backfill.ts` + a schedule entry (`src/lib/schedules/*`) OR a CLI subcommand (J9). Embeds docs whose `embedding IS NULL` in batches, best-effort. Needed because docs created before `EMBEDDINGS_URL` was set have no vector.
- Test: `tests/unit/embed-backfill.test.ts` — given a fake `embed`, processes only null-embedding rows, skips on disabled, never throws.

### J4-3 — Search-repo ranking test (GATE for J4/J6) — TEST-ONLY
- File: `tests/unit/search-ranking.test.ts`. Seed docs; assert `searchFullText` orders by `ts_rank` desc and respects filters; assert `searchSemantic` orders by cosine asc. (Locks ranking so J6 changes can't regress it.)

---

## J5 — Backlinks panel + graph  *(backend EXISTS → new UI)*

### J5-1 — Backlinks panel in the editor — NEW COMPONENT
- File: `src/components/editor/BacklinksPanel.tsx`; fetch `/api/docs/[id]/backlinks`; list linking docs; click navigates. Toggle from the editor chrome.
- Browser probe: create doc A with `[[B]]`, open B, assert the panel lists A; click A and assert navigation.

### J5-2 — Graph data endpoint *(TDD)* — NEW ROUTE + repo fn
- Files: `src/app/api/graph/route.ts` + `doc-links-repo.ts` `graphEdges(ownerId)` → `{nodes:[{id,title}], edges:[{from,to}]}` from `docLinks` joined to owned docs.
- Test: repo test — edges only between owned, non-trashed docs; no dangling node for a deleted target.

### J5-3 — Graph view — NEW COMPONENT (no heavy dep if avoidable)
- File: `src/components/graph/GraphView.tsx`. Render `/api/graph` as an SVG force-ish/radial layout. Prefer a tiny self-contained layout (no d3 bundle) unless a dep is justified — **decide in J5-3a spike**, document choice.
- Browser probe: with ≥3 interlinked docs, assert N circles + M lines render and a node click navigates.

---

## J6 — Search operators  *(partial → structured operators)*

### J6-1 — Query operator parser *(pure, TDD)* — NEW FILE
- File: `src/lib/search/operators.ts`. `parseQuery(raw)` → `{ text, filters: {tagName?, folderName?, starred?, titleContains?, before?, after?} }`. Operators: `tag:foo`, `folder:bar`, `is:starred`, `title:"…"`, `before:2026-01-01`, `after:…`. Quoted phrases preserved into `text`; unknown operators pass through as text.
- Test: `tests/unit/search-operators.test.ts` — each operator extracted; multiple operators; quoted values; malformed dates ignored (not thrown); `-tag:x` negation (if supported) excluded.

### J6-2 — Wire operators into `/api/search` — EDIT
- File: `src/app/api/search/route.ts`. Resolve `tagName`→`tagId`/`folderName`→`folderId` (owner-scoped lookups), merge into `SearchFilters`, pass remaining `text` to FTS/semantic. Keep graceful fallback.
- Test: route test — `q="report tag:work is:starred"` yields filters `{tagId, starred:true}` and FTS text `report`.

### J6-3 — Operator affordance in the palette — EDIT
- File: `CommandPalette.tsx`. Show a hint row of available operators; reflect parsed chips. Browser probe: type `tag:`, assert a chip/hint renders; results reflect the filter.

---

## J7 — Import (markdown + docx)  *(EXISTS over-scoped → constrain + UI + tests)*

**Locked decision: md + docx only — drop Obsidian/Notion.**

### J7-1 — Constrain detection to md+docx — EDIT
- File: `src/lib/import/index.ts` + `/api/docs/import`. Make `detectImportType` return `unknown` for `.zip`/notion and (decide) for `.html`; OR keep the code but gate the **route** to accept only md/docx (415 otherwise). Prefer route-gating + leaving lib intact behind a flag. Update the route's doc comment + max-size note.
- Test: extend `import.test.ts` — `.zip`→415 (or unknown), `.docx`→md JSON, `.md`→md JSON with H1 title; malformed docx → 200 + warnings (never 500).

### J7-2 — Markdown round-trip test (GATE) — TEST-ONLY
- File: `tests/unit/import-roundtrip.test.ts`. For a corpus of markdown features (headings, lists, code fences, tables, links, images, blockquotes, task lists), assert `serializeMarkdown(markdownToJson(md))` is semantically equal to `md` (normalize whitespace). Any lossy feature gets an explicit documented exception in the test, not silent.

### J7-3 — docx fidelity test (GATE) — TEST-ONLY
- File: `tests/unit/import-docx-fidelity.test.ts`. Ship a tiny fixture `.docx` (headings, bold/italic, list, table) under `tests/fixtures/`. Assert the imported PM JSON contains the expected node types/marks (≥ a documented fidelity floor). Use the existing mammoth path.

### J7-4 — docx image extraction — EDIT
- File: `src/lib/import/index.ts`. mammoth can emit embedded images as data URIs; persist them via the J1 store and rewrite `src` to `/assets/…` so imported docs don't carry megabytes of base64 in `markdown`/`content`. Best-effort; on failure keep the data URI.
- Test: fixture docx with one image → imported doc references an `/assets/…` URL (or, if J1 store unavailable in unit ctx, a data URI with a recorded warning).

### J7-5 — Import UI entry point — EDIT
- File: `src/components/shell/NewMenu.tsx` (or FileManager toolbar). "Import" → file picker (accept `.md,.docx`) → POST `/api/docs/import` → navigate to the new doc, surface `warnings`.
- Browser probe: upload a small `.md` blob via the input; assert navigation to the new doc and that its title matches the `# H1`.

---

## J8 — REST API + scoped tokens  *(EXISTS unscoped → add scopes + docs)*

**This is the real J8 work: today a PAT is full-access.**

### J8-1 — Add `scopes` to the PAT model — MIGRATION + EDIT
- Files: `src/db/schema.ts` (`pats.scopes text[] notnull default '{}'` or a `scope text` enum-ish), hand-written migration **0027** (J's allocated number per the integrated journal — hand-write it, do NOT run `drizzle-kit generate` off a stale base). `pat.ts` `issuePat(ownerId, name, scopes)` persists+returns scopes; `verifyPat` returns `{user, scopes}` (change the return type — update `guard.ts` callers). If J1-0's spike concludes a `documents` asset-layout column is also needed, it shares this same migration file.
- Test: `tests/unit/pat-scopes.test.ts` — issue with `['read']`; verify returns those scopes; default empty.

### J8-2 — Scope matcher + guard enforcement *(pure, TDD)* — NEW + EDIT
- Files: `src/lib/auth/scopes.ts` (`hasScope(granted, required)`, scope hierarchy: `write` implies `read`; resource scopes like `docs:read`/`docs:write` — **decide the scope taxonomy in J8-0 spike**). `guard.ts` gains `authenticateRequest(req, {require?: Scope})` returning null/403 when a Bearer token lacks the scope (cookie sessions are full-access — unchanged).
- Test: read token + write route → denied; write token + read route → allowed (implication); cookie session → allowed; missing scope on Bearer → 403, not 404 (this is authz of a known principal, distinct from IDOR).

### J8-3 — Apply scope requirements to the REST surface — EDIT
- Files: mutating routes under `src/app/api/docs/*` (`route.ts` POST/PUT/PATCH/DELETE, `rename`,`move`,`trash`,`restore`,`star`,`bulk`,`tags`,`import`,`assets` POST) require `docs:write`; GET/list/search/export require `docs:read`. PAT-management routes stay session-only (already enforced in `pat/route.ts#requireSessionUser`).
- Test: a `read`-scoped token gets 200 on GET `/api/docs`, 403 on POST `/api/docs`, 403 on bulk-trash. (THE bar: "a read token can't write.")

### J8-4 — Scope selection in PAT UI — EDIT
- Files: `src/components/settings/PATManager.tsx` + `settings/developer/page.tsx`. Checkboxes for scopes on create; show granted scopes in the list.
- Browser probe: create a read-only token; assert the list row shows `read`; (with that token via `fetch` in `preview_eval`) assert a write call returns 403.

### J8-5 — REST API reference doc — NEW DOC
- File: `docs/api.md` (and link from `settings/developer`). Enumerate stable endpoints, auth header, scopes, request/response shapes, rate-limit notes. (Markdown only; no code.)

### J8-6 — Security review (GATE)
- `security-review` on the J8 diff: scope-bypass, privilege escalation (read→write), token-in-URL leakage, timing on `verifyPat`, PAT cannot mint PATs (already enforced — assert a test), 403-vs-404 oracle consistency.

---

## J9 — `parchment` CLI  *(NEW — greenfield)*

### J9-0 — CLI scaffold — NEW
- Files: `cli/parchment.ts` (entry, `tsx`-run), `package.json#bin` `{ "parchment": "cli/parchment.ts" }`, `scripts` add `cli`. Arg parsing minimal (no heavy dep, or a tiny one — document choice). Subcommand router + `--help`.
- Test: `tests/unit/cli-args.test.ts` — pure arg-parser: dispatches subcommands, `--help`, unknown command exits non-zero with a message.

### J9-1 — `user create` — NEW
- Calls the same lib `bootstrap.ts`/user-create path used by the app (no duplicate logic). Owner/admin creation, password from prompt/env.
- Test: pure unit on the option-validation; integration optional behind a DB-available guard.

### J9-2 — `backup` / `restore` — NEW
- Wrap the existing `/api/backup/export`+`restore` libs (`src/lib/backup/*`) directly (not over HTTP). Dry-run flag.
- Test: arg-validation unit; the underlying lib is already covered.

### J9-3 — `migrate` / `embed-backfill` — NEW
- `migrate` shells `drizzle-kit migrate`; `embed-backfill` calls J4-2. 
- Test: dispatch unit.

### J9-4 — CLI docs — NEW DOC
- `docs/cli.md` + README mention.

---

## J10 — Focus / zen mode + writing goals  *(NEW)*

### J10-1 — Writing-goal model *(pure, TDD)* — NEW FILE
- File: `src/lib/editor/goals.ts`. `goalProgress({words, targetWords})` → `{pct, remaining, done}`; persistence of per-doc target in `documents.meta.writingGoal` (jsonb exists). Reuse `counts.ts`.
- Test: `tests/unit/writing-goals.test.ts` — progress math, clamp 0–100, zero/over-target edges.

### J10-2 — Persist + read per-doc goal — EDIT
- Files: a tiny `PUT /api/docs/[id]/goal` (or fold into the doc PATCH) writing `meta.writingGoal`; repo helper. Owner-scoped.
- Test: route test set/get round-trip.

### J10-3 — Focus/zen mode UI — NEW
- Files: `src/components/editor/Editor.tsx` (+ a `FocusToggle`/CSS). Zen mode hides sidebar/toolbar/chrome, centers the column, optional typewriter scroll; ESC exits. Goal/progress + reading-time shown in a minimal footer (extend `WordCountDialog.tsx`/footer).
- Browser probe: toggle zen; assert chrome elements get `hidden`/aria state and the editor column is centered; set a 100-word goal, type, assert the progress element updates; ESC restores chrome.

---

## J11 — Bulk ops + trash retention  *(EXISTS → gap-fill)*

### J11-1 — Bulk delete-forever + restore — EDIT
- File: `src/app/api/docs/bulk/route.ts`. Add `action:'restore'` and `action:'delete'` (permanent, only from trash). Mirror owner-skip semantics; permanent delete also removes disk mirror + assets.
- Test: route test — `restore` clears `trashedAt` for owned trashed docs; `delete` removes rows + returns affected count; non-owned ids skipped.

### J11-2 — Retention-policy settings UI — EDIT
- Files: a settings surface (e.g. `settings/workspace` or a new trash section) calling `/api/settings/trash-retention` (exists). Show current days, edit, explain auto-purge.
- Browser probe: set days to 7; reload; assert the input reflects 7; assert `getTrashRetentionDays` persisted.

### J11-3 — Trash list polish + bulk bar in trash — EDIT
- File: `src/components/file-manager/FileManager.tsx` (`view='trash'` + `BulkBar`). Wire the new restore/delete bulk actions; show trashed-date + days-until-purge.
- Browser probe: select 2 trashed docs, bulk-restore, assert they leave the trash view.

---

## J12 — Custom CSS / per-doc theme + more themes  *(partial → extend)*

### J12-1 — Per-doc theme override model *(pure, TDD)* — NEW/EDIT
- File: `src/lib/editor/doc-theme.ts`. `resolveDocTheme(meta)` → token overrides (e.g. page bg/accent/font) stored in `documents.meta.theme`. Validate against an allow-list (no arbitrary CSS injection — that's J12-3's sanitized path).
- Test: `tests/unit/doc-theme.test.ts` — valid presets resolve to token vars; unknown keys dropped.

### J12-2 — Apply per-doc theme in the editor + share viewer — EDIT
- Files: editor wrapper + `render-pm.tsx` (the public share renderer). Apply `data-*`/inline token vars from `resolveDocTheme`. **Must be export-mode-safe** (no stored-XSS — only token vars, never raw CSS, on the public path).
- Browser probe: set a doc theme preset; assert the wrapper's computed accent var changes; open the share view and assert the same vars apply.

### J12-3 — Workspace-level custom CSS surfacing — EDIT
- Files: `StylesManager.tsx` + `/api/settings/styles` (exist). Ensure the sanitize+scope (`custom-css.ts`, `.parchment-custom-scope`) is applied workspace-wide and in the share viewer. (Mostly wiring + a sanitizer regression test.)
- Test: extend `custom-css.test.ts` — `@import`, `expression()`, `javascript:`, `</style>` break-out, `@scope` all stripped; selectors prefixed.

### J12-4 — More built-in themes — EDIT
- File: `src/styles/tokens.css` (+ theme registry). Add 2–3 bundled themes (e.g. sepia, solarized, high-contrast-plus) as `[data-theme="…"]` blocks layered over light/dark, WCAG-checked.
- Browser probe: switch to each new theme; assert `--page-bg`/`--foreground` computed values match the theme and contrast ratio ≥ 4.5:1 for body text (compute in the probe).

### J12-5 — Security review (GATE for J12)
- `security-review` on J12: confirm NO raw user CSS reaches the share renderer un-sanitized/un-scoped; per-doc theme is token-only; sanitizer covers the break-out vectors.

---

## Cross-cutting verification (run before declaring Group J done)

1. **Unit suite green:** `pnpm test` — all new tests + the GATE tests (J3-roundtrip, J7-2/J7-3, J4-3, J6-1, J8-2/J8-3, J12-3) pass.
2. **Types + lint:** `pnpm typecheck` && `pnpm lint` clean.
3. **Security gates closed:** J1-7, J8-6, J12-5 reviews show no open findings.
4. **The four bar-setting assertions explicitly demonstrated by a test:**
   - md→import→md round-trips (J7-2); docx imports with documented fidelity (J7-3).
   - upload path-traversal blocked + size limits enforced (J1-2, J1-4, J1-7).
   - a read-scoped token CANNOT write (J8-3 test).
   - search ranking is deterministic (J4-3, J6-2).
5. **Browser DOM probes** (local dev server, `preview_eval`/`preview_inspect` — NOT screenshots) recorded for every UI task: J1-6, J2-3, J3-1/2, J4-1, J5-1/3, J6-3, J7-5, J8-4, J10-3, J11-2/3, J12-2/4.
6. **No placeholders:** grep the diff for `TODO`/`FIXME`/`throw new Error('not implemented')` — none in shipped code.

## Build order within J (dependency-driven)
`J1-0 → J1-1..7` and `J8-0 → J8-1..6` are foundational (uploads + auth) — do first.
Then `J6 → J4` (operators feed search; semantic UI), `J7` (depends on J1 store for images), `J2/J3/J11` (file-manager polish, independent), `J5` (independent UI), `J10/J12` (editor UI, independent).
`J9` (CLI) last — it wraps libs the others harden (backup/user/embed-backfill).
