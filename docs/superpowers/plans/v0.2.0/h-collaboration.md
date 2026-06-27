# Parchment v0.2.0 — Group H: Collaboration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` + `superpowers:test-driven-development`. Steps use checkbox (`- [ ]`) syntax; **every code task is RED→GREEN→REFACTOR** (write the failing test first, watch it fail, then implement). Each task ends with a verifiable deliverable. NO placeholders, NO `// TODO`, NO "wire later" — every task ships working end-to-end behind its tests.

**Goal:** Ship the four H items as fully-working, no-bug collaboration:
- **H1** Comments + suggestion mode — threaded comments anchored to a selection that **survive concurrent edits**, resolve, @mention → notification (via Group B); suggestion mode = tracked insertions/deletions a reviewer can **accept/reject correctly**.
- **H2** Publish-to-web — a read-only public page reusing `render-pm`.
- **H3** Share-link permission levels (view / comment / edit) + expiry — **enforced server-side** (a view link cannot comment or edit; an expired link is dead).
- **H4** Real-time presence — cursors / avatars of who is editing/viewing (Yjs awareness).

**Build order inside H:** H1-anchoring core → H1-suggestion accept/reject → H3 permission+expiry enforcement (server) → H1 comment-over-share + @mention notify → H2 publish-to-web → H4 presence polish. H3's server gate is a hard dependency for "comment/edit over a share link", so it lands before the share-write paths.

**Architecture:** Next.js 16 (App Router / RSC / Turbopack), React 19, TS6 strict, Biome v2, Tiptap v3 + ProseMirror, Yjs 13.6 + Hocuspocus 4.3 (`@hocuspocus/server` in `collab/server.ts`, `@hocuspocus/provider` in the client), `y-prosemirror` 1.3.7 binding, Drizzle/Postgres.

---

## What already exists (verify, do NOT rebuild)

This group is **mostly gap-closing + server-side enforcement + durability + two-client correctness**, not greenfield. The forward-declared schema and half-built extensions are already in the tree:

- **DB** (`src/db/schema.ts`): `comments` (id, docId, threadId, authorId, body, mentions jsonb, `anchorFrom`/`anchorTo` **integer** PM positions, resolved, createdAt), `shares` (token, `permission` `view|comment|edit|suggest`, passwordHash, expiresAt), `collabState` (bytea Yjs snapshots), `auditLog`, `users.role`.
- **Comments**: `src/lib/docs/comments-repo.ts` (createThread/addReply/listComments/setResolved/deleteComment + `fireCommentCreated` webhook), `src/lib/docs/comments-shared.ts` (`CommentRow` type + `parseMentions`), API `src/app/api/docs/[id]/comments/route.ts` + `.../[commentId]/route.ts` (**owner-only** today: `doc.ownerId !== user.id → 404`), UI `src/components/editor/CommentsSidebar.tsx`, mark `src/lib/editor/extensions/comment.ts` (`CommentMark`, `setCommentThread`/`unsetCommentThread`, click → `parchment:focus-comment` DOM event).
- **Suggestion mode**: `src/lib/editor/extensions/suggesting.ts` (`Suggesting` extension + `InsertionMark`/`DeletionMark`, `setSuggesting`/`toggleSuggesting`/`acceptChange`/`rejectChange`/`acceptAllChanges`/`rejectAllChanges`, Backspace/Delete intercept, `appendTransaction` insertion-wrap), pure core `src/lib/editor/track-changes.ts` (`resolveChange`, `collectChanges`, `authorColor` 12-colour WCAG palette), panel `src/components/editor/SuggestionsPanel.tsx`. Tests: `tests/unit/suggesting.test.ts`, `tests/unit/track-changes.test.ts`.
- **Shares**: `src/lib/docs/shares-repo.ts` (createShare/listShares/revokeShare/`resolveShare`/`verifySharePassword`, `isExpired`, `isWritePermission`, `PERMISSIONS`), public data path `src/app/api/share/[token]/route.ts` (POST `{password?}` → `{docId,title,contentJson,permission,customCss}`, **read-only**, expiry+password enforced server-side), viewer `src/components/share/ShareViewer.tsx` (renders read-only; shows a "view-only in v0.1" note for any write perm), renderer `src/components/share/render-pm.tsx` (XSS-safe PM-JSON→React, never `dangerouslySetInnerHTML` except the export-gated codeBlock path). Manage UI `src/components/editor/ShareDialog.tsx`. Tests: `tests/unit/shares.test.ts`, `tests/integration/shares.test.ts`, `tests/unit/share-link.test.ts`.
- **Presence**: awareness identity is already published — `Editor.tsx:1422` `provider.setAwarenessField('user', {name, color})` and `:1436` `setAwarenessField('reading', {pos, updatedAt})`; remote cursors via `CollaborationCaret.configure({provider, user})` (`Editor.tsx:870`). Reducer `src/lib/editor/reading-presence.ts` (`collectReaders`, `throttle`), components `ReadingPresence.tsx`, `StatusBar.tsx`, `Editor.tsx`'s `UserCluster` avatar. Tests: `tests/unit/reading-presence.test.ts`, `tests/unit/reading.test.ts`.
- **Collab server** (`collab/server.ts`): Hocuspocus + `Database` extension persisting to `collab_state`; owns the disk reverse-sync watcher + Y.Doc bridge. **No `onAuthenticate` hook today** (anyone who can reach the WS can open any doc) — H3 edit-over-share needs an auth bridge here.
- **Auth**: `src/lib/auth/guard.ts` (`requireUser`, `requireAdmin`, `isAdmin`, `authenticateRequest` = cookie OR `Bearer pat_…`). `src/lib/auth/session.ts` (`SESSION_COOKIE`, `getUserByToken`). Doc page `src/app/(app)/d/[id]/page.tsx` passes `currentUserName`/`currentUserId` to `<Editor>`.

### Coordination with Group A (`document_permissions`)

Group A introduces real per-document ACLs (`document_permissions` table: docId, userId, role `owner|editor|commenter|viewer`) and multi-user auth. **H must not duplicate or fork A's access logic.** Concretely:

- **H imports `getDocAccess` and `authorizeDocRoute` from `@/lib/authz/doc-access` (owned by Group A).** H does NOT create `src/lib/docs/access.ts`. The canonical module returns `{canView, canComment, canEdit, canManage}` — the full capability set H needs, including owner-status, share-grant, and `document_permissions` union.
- The **share-link** permission (this group) and the **per-user ACL** (Group A) are two independent grant sources that both feed `getDocAccess` inside A's module. A view-only share link can never exceed a viewer; a logged-in editor via ACL keeps their edit rights regardless of the link.
- Every H comment/edit/suggest/manage route calls `getDocAccess` from `@/lib/authz/doc-access` — never re-checks `doc.ownerId` inline, never forks or duplicates the capability logic.

---

## Global constraints

- Pin newest stable for any new dep (see [feedback_latest_versions]). The two anchoring helpers we need are **already installed** — no new dep for anchoring: `yjs` exports `createRelativePositionFromTypeIndex`, `createAbsolutePositionFromRelativePosition`, `relativePositionToJSON`, `createRelativePositionFromJSON`; `y-prosemirror` exports `absolutePositionToRelativePosition` / `relativePositionToAbsolutePosition` and the `ySyncPluginKey` (binding lives at `ySyncPluginKey.getState(editor.state).binding`, fields `.mapping`, `.type`, `.doc`).
- Biome CI = `biome check .` repo-wide. A stray nested `biome.json` from an agent worktree breaks it — `git worktree remove --force` before checking.
- TS6 strict, no `any` in committed code (tests may use the project's `Record<string, unknown>` walker pattern). No new unconditional hardcoded colors — suggestion/comment tints use `var(--success)`/`var(--error)`/`var(--accent)`/`--page-*` tokens (the v0.1.10 sweep already moved `.parchment-insertion`/`.parchment-deletion` to tokens; keep them token-driven).
- **Security is access control.** Every public/share path returns ONLY the safe shape (never `ownerId`, `passwordHash`, other-doc data). Expiry + password + permission level are enforced **server-side, every request** — the client UI gating is cosmetic and must be assumed bypassed.
- One release branch (the v0.2.0 branch per [feedback_build_discipline]); per-item commits; do NOT auto-push the tag — gate on user confirm after CI green. Multi-arch publish on GH runners.
- Version bump in BOTH `package.json` and `src/lib/version.ts`; prepend a `CHANGELOG` entry in `src/lib/help/content.ts`.
- **Two-client concurrency is the headline risk of this group.** Anchoring, suggestion accept/reject, and presence all break in subtle ways under concurrent edits that a single-client test never catches. Every such task carries an explicit **two-client test** (Task 13 builds the harness; later tasks consume it). A task that touches shared Y.Doc state is NOT done until its two-client test is green.

---

## Verification bar (NO BUGS)

A task is complete only when ALL of these hold (evidence before assertion — `superpowers:verification-before-completion`):

1. `pnpm test` (vitest) green, `pnpm typecheck` clean, `biome check .` clean.
2. The task's own RED test was observed failing before implementation.
3. **Anchor survival** (Task 3/13): a comment anchored to "world" in `hello world` stays attached to "world" after another client inserts "BIG " before it — the resolved absolute range still covers "world", not "worl" or "d big".
4. **Suggestion accept/reject correctness** (Task 5): accept-insertion keeps text + drops mark; reject-insertion removes text; accept-deletion removes text; reject-deletion keeps text + drops mark — verified on doc JSON, including a two-author interleaved doc.
5. **Permission enforcement** (Task 8/9/10): a `view` share token POSTing to the comment-create or edit path is rejected `403` server-side (proven with the cookie absent — token-only). A `comment` token cannot edit; an `edit` token cannot manage shares.
6. **Expiry blocks** (Task 8): a share with `expiresAt` in the past returns `404`/`403` on every path (read, comment, edit, presence handshake) — not just the read viewer.
7. **Browser DOM probes, not screenshots** (Task 14): comment thread + presence verified by querying the live DOM (`document.querySelector('[data-thread-id]')`, awareness state via `provider.awareness.getStates()`), never by screenshot diffing.

---

## Phase 0 — Anchoring core (the load-bearing decision)

### Task 1 (DECISION RECORD): comment anchoring strategy

**Files:** create `src/lib/docs/comment-anchor.ts` (header doc-comment only in this task; implementation in Task 3). No test.

**Decision (locked):** Comments are stored in the **DB `comments` table** (NOT the `.md` sidecar — keep portable markdown clean). A comment's anchor is stored as a **Yjs RelativePosition pair serialized to JSON**, plus the integer `anchorFrom`/`anchorTo` kept as a **fallback/migration** value.

Rationale and the three rejected alternatives, written into the file header so future readers don't relitigate:

- **Chosen — Yjs RelativePosition (relative to the doc's `default` XmlFragment).** `absolutePositionToRelativePosition(pmPos, binding.type, binding.mapping)` → a `Y.RelativePosition` → `relativePositionToJSON` → store in two new jsonb columns `anchor_start`/`anchor_end`. On load, `createRelativePositionFromJSON` → `relativePositionToAbsolutePosition(ydoc, fragment, relPos, binding.mapping)` → an absolute PM position. **This is the only representation that survives concurrent edits**: a RelativePosition binds to the Yjs item (character) identity, so inserting/deleting text *before* the anchor shifts the resolved absolute position automatically, with no remap bookkeeping, even across offline merges. It is the same machinery `getRelativeSelection` uses for cursors.
- **Rejected — integer PM positions only (the current `anchorFrom`/`anchorTo`).** Absolute positions are invalidated by any edit before them; under collaboration there is no single transaction to `.mapping.map()` through, so they silently drift. Keep them populated for the **non-collab fallback** and migration, but they are not authoritative.
- **Rejected — `comment` mark in the doc content.** A mark in the ProseMirror/Yjs doc *would* move correctly, but it stores thread state in the portable `.md` mirror (violates the locked "DB, not sidecar" decision), bloats markdown round-trips, and makes "list all comments for a doc" a doc-walk instead of a SQL query. We DO keep a **transient** `CommentMark` (already built) as a **visual highlight only**, re-applied from DB anchors on load and never serialized to markdown (verify `markdown` serialization strips it — Task 11).
- **Rejected — character-offset into plain text.** Breaks on any structural (node) edit and on identical repeated substrings.

**Anchor lifecycle:** create → resolve current selection to a RelativePosition pair → POST stores both the JSON anchor and the integer fallback. Load → resolve JSON anchor → absolute range → apply transient `CommentMark` + position the margin card. Edit → no action needed (relative positions auto-track); the margin re-renders card vertical positions on `editor.on('update')` by re-resolving anchors (debounced).

- [ ] Write the file header (the four bullets above, condensed) and export the planned function signatures as `declare`d types only:
  `serializeAnchor(editor, from, to): { start: AnchorJson; end: AnchorJson } | null`,
  `resolveAnchor(editor, anchor): { from: number; to: number } | null`,
  where `AnchorJson` is the `relativePositionToJSON` shape. Deliverable: file compiles; `pnpm typecheck` clean.

---

### Task 2 (MIGRATION): add durable anchor columns + comment notification plumbing

**Files:** modify `src/db/schema.ts`; hand-write migration `src/db/migrations/0025_comment_anchors.sql` (H's allocated block per the reconciliation; do NOT run `pnpm db:generate` — hand-number it **0025** and add the journal entry against the integrated branch).

- [ ] **RED:** add `tests/unit/comment-anchor-schema.test.ts` asserting `schema.comments.anchorStart` and `schema.comments.anchorEnd` exist and are jsonb-typed (import `schema`, check the column builder), and that `parseMentions` still resolves (re-export guard). Watch it fail.
- [ ] **GREEN:** in `comments` add `anchorStart: jsonb('anchor_start')` and `anchorEnd: jsonb('anchor_end')` (nullable; null on replies and on legacy rows). Keep `anchorFrom`/`anchorTo` (fallback). Add `index('comments_doc_resolved_idx').on(t.docId, t.resolved)` (the sidebar's open/resolved filter and the published-doc comment count both hit this). Hand-write `0025_comment_anchors.sql` as an additive ALTER (no destructive changes to existing columns): `ALTER TABLE comments ADD COLUMN IF NOT EXISTS anchor_start jsonb; ALTER TABLE comments ADD COLUMN IF NOT EXISTS anchor_end jsonb; CREATE INDEX IF NOT EXISTS comments_doc_resolved_idx ON comments (doc_id, resolved);`. Update the Drizzle journal to register `0025`.
- [ ] Extend `CommentRow` (`comments-shared.ts`) and `Comment` (repo) with `anchorStart`/`anchorEnd` (JSON-typed `AnchorJson | null`). Deliverable: migration `0025` present with journal entry; schema test green; typecheck clean.

---

### Task 3 (ANCHORING): RelativePosition serialize/resolve + survival under concurrent edits

**Files:** implement `src/lib/docs/comment-anchor.ts`; test `tests/unit/comment-anchor.test.ts` (`@vitest-environment jsdom`).

This is the **highest-risk correctness task in the group**. It uses a real Tiptap editor bound to a Y.Doc (the suggesting test already constructs editors this way) so the y-prosemirror binding exists.

- [ ] **RED (basic round-trip):** build an editor with `baseExtensions` + `Collaboration.configure({document: ydoc, field: 'default'})` over a `new Y.Doc()`, set content `<p>hello world</p>`, select the "world" range, `serializeAnchor` → `resolveAnchor` → assert it returns the SAME `{from,to}` covering "world". Watch fail (function not implemented).
- [ ] **GREEN:** implement both functions:
  - `serializeAnchor`: read `binding = ySyncPluginKey.getState(editor.state).binding`; if absent (non-collab editor) return `null` (caller falls back to integer positions). `absolutePositionToRelativePosition(from, binding.type, binding.mapping)` and same for `to`; `relativePositionToJSON` each; return `{start, end}`. **Use `assoc`**: anchor `start` with `assoc: -1` (binds to the char to its right so text inserted exactly at the boundary lands OUTSIDE the comment start) and `end` with `assoc: 0`/`+1` so an insertion at the boundary extends with the commented text per Docs semantics — pick and document the convention; the test pins it.
  - `resolveAnchor`: `createRelativePositionFromJSON` each; `relativePositionToAbsolutePosition(ydoc, fragment, relPos, binding.mapping)`; if either resolves to `null` (the anchored text was deleted) return `null` (caller renders the thread as "orphaned"). Clamp `from <= to`.
- [ ] **RED → GREEN (SURVIVAL — the bar #3 test):** with the editor still bound, capture an anchor for "world", then **simulate a concurrent remote edit**: build a SECOND `Y.Doc`, sync it from the first (`Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1))`), on doc2 insert "BIG " at the start of the paragraph, push the update back (`Y.applyUpdate(doc1, Y.encodeStateAsUpdate(doc2))`). Now the editor text is `<p>BIG hello world</p>`. Re-`resolveAnchor` the SAME stored JSON → assert the resolved range still exactly covers "world" (its absolute `from` shifted by +4). This proves anchors survive text inserted before them across a CRDT merge.
- [ ] **RED → GREEN (anchored text deleted):** delete "world" on doc2, merge back, `resolveAnchor` → `null`. Caller treats as orphaned.
- [ ] **RED → GREEN (structural edit before anchor):** insert a new paragraph above; anchor still resolves onto "world".
- [ ] Deliverable: all anchor tests green, including the concurrent-edit survival case; typecheck + biome clean.

---

## Phase 1 — Suggestion mode accept/reject correctness

### Task 4 (SUGGEST): close the documented gaps in `suggesting.ts`

**Files:** modify `src/lib/editor/extensions/suggesting.ts`; extend `tests/unit/suggesting.test.ts`.

The extension is mature but its own header lists gaps that bite under real review. Close the ones that affect correctness (defer pure-cosmetic ones with a one-line note, but the data-integrity ones are in scope):

- [ ] **RED:** add tests for: (a) **paste over a selection** while suggesting → the replaced text is deletion-marked AND the pasted text is insertion-marked (today paste-over isn't intercepted, so the old text vanishes — a tracked-change integrity bug); (b) **node-level delete** of a whole block (e.g. an image) while suggesting → it is NOT silently removed (mark the wrapping or block-flag it; at minimum it must not disappear without a tracked change); (c) **Cut (Cmd-X)** while suggesting → behaves like a tracked deletion, not a hard delete. Watch fail.
- [ ] **GREEN:** implement via `handleDOMEvents.paste`/`cut` and a `handleKeyDown` extension that routes through the existing deletion-mark path; reuse `authorColor`/`resolveChange`. Keep the `appendTransaction` insertion-wrap idempotent (it already guards double-marking). Deliverable: gap tests green; existing suggesting tests still green.

---

### Task 5 (SUGGEST): accept/reject correctness incl. two-author interleaving

**Files:** extend `src/lib/editor/track-changes.ts` (pure) + `tests/unit/track-changes.test.ts` and `tests/unit/suggesting.test.ts`.

The pure `resolveChange` table is correct; the risk is `collectChanges` + the accept/reject *application* under interleaved authors and adjacent insertion/deletion runs.

- [ ] **RED:** in `track-changes.test.ts`, feed `collectChanges` a doc JSON with: an insertion by author A immediately followed by a deletion by author B (adjacent, different authors) → expect TWO distinct `TrackedChange`s (no merge across author or type — the merge predicate already checks both; pin it). Add a doc where an insertion and deletion by the SAME author are adjacent → still two changes (different type). Watch — confirm current behaviour; fix the predicate if it over-merges.
- [ ] **RED:** in `suggesting.test.ts`, build a doc with interleaved A-insertion / B-deletion / A-insertion, call `acceptAllChanges`, assert: every insertion's text remains (mark gone), every deletion's text is removed, and **positions don't corrupt** (the right-to-left sort already guards this — add the test that would fail if someone reorders it). Then a fresh doc + `rejectAllChanges`: insertions gone, deletion text restored. Watch fail / confirm.
- [ ] **RED:** single accept/reject by `(from,to,type)` on a change that is NOT at the doc edge, with other changes after it, leaves the other changes intact and correctly located.
- [ ] **GREEN:** fix any merge/position bug surfaced. Deliverable: all four bars-#4 cases green.

---

### Task 6 (SUGGEST-COLLAB): suggestion mode interaction with Yjs — design + test

**Files:** doc-comment in `suggesting.ts`; test `tests/unit/suggesting-collab.test.ts` (jsdom, two Y.Docs).

**The open question this task RESOLVES:** insertion/deletion are plain ProseMirror **marks** stored in the doc content, so they sync through Yjs like any other formatting — two clients in suggestion mode produce a correctly-merged set of tracked changes with NO extra plumbing. The subtlety is **accept/reject under concurrency**: if client A accepts a change (removing text) while client B is still typing inside that same insertion run, the CRDT merges both edits; the *outcome* must be sane (B's keystrokes survive as their own insertion; A's accept applied to the range that existed when A dispatched).

- [ ] **RED:** two editors bound to synced Y.Docs, both `setSuggesting(true)`. On editor1 type "abc" (insertion-marked). Sync to editor2. On editor2, `acceptChange` over "abc". Sync back. Assert editor1's doc now has "abc" with NO insertion mark (accepted), and the docs are identical. Watch.
- [ ] **RED (the hazard):** editor1 types "abc" (insertion); BEFORE sync, editor2 (which doesn't yet see "abc") types "xyz" elsewhere; sync both ways; editor2 accepts "abc"; assert both runs resolve correctly and docs converge. Watch.
- [ ] **GREEN / DOCUMENT:** if convergence holds with marks-as-content (expected), write the finding into the header ("suggestion marks ride Yjs natively; accept/reject is a local transaction that the CRDT merges — no suggestion-specific awareness or locking needed"). If a real divergence shows, the fix is to make accept/reject operate via `editor.commands` (which dispatch through the y-prosemirror binding) rather than mutating a stale `state.tr` snapshot — adjust and re-test. Deliverable: convergence tests green; the Yjs-interaction question is answered in-code.

---

## Phase 2 — Server-side permission + expiry enforcement (gates the share-write paths)

### Task 7 (SHARE-AUTH): resolve a request's share grant from a token

**Files:** create `src/lib/docs/share-grant.ts`; test `tests/unit/share-grant.test.ts` + `tests/integration/share-grant.test.ts` (Testcontainers, mirrors `tests/integration/shares.test.ts`).

A share link must let an **unauthenticated** visitor act at its permission level. Define how a request carries the share token and how it maps to a capability.

- [ ] **RED (unit, pure):** `shareCapabilities(permission)` → `{canView, canComment, canEdit}`: `view`→view only; `comment`→view+comment; `edit`→view+comment+edit; `suggest`→view+comment (suggest is an edit-via-tracked-changes; treat as comment+edit-suggesting, NOT raw edit — document the choice). Watch fail.
- [ ] **RED (integration):** `resolveShareGrant(token, password)` → `null` for missing/expired/wrong-password; else `{share, capabilities}`. It composes the existing `resolveShare` (already drops expired) + `verifySharePassword`. Assert an expired token → `null` (proves bar #6 at the resolution layer). Watch fail.
- [ ] **GREEN:** implement both, reusing `shares-repo` (do not duplicate the argon2/expiry logic — call it). The token travels on **share-scoped routes** under `/api/share/[token]/...` (so the capability is bound to the URL the visitor already holds), NOT on the owner-auth `/api/docs/[id]/...` routes. Deliverable: unit + integration green.

---

### Task 8 (ACCESS): wire H routes to Group A's canonical `getDocAccess`

**Files:** NO new `src/lib/docs/access.ts` — import from `@/lib/authz/doc-access` (Group A owns and builds it). Test `tests/integration/doc-access.test.ts` verifies H's call-sites, not a forked implementation.

Per §1c of the reconciliation: H MUST NOT create `src/lib/docs/access.ts` or any local fork of doc-authorization. Group A exposes both `getDocAccess({user?, shareGrant?}, docId) → {canView, canComment, canEdit, canManage}` (capability-set + share-grant union) and `authorizeDocRoute(user, docId, action) → {ok, status}` from `@/lib/authz/doc-access`. H imports both and uses them as its sole authorization source.

- [ ] **VERIFY:** confirm `@/lib/authz/doc-access` is present (Group A must ship it before H Task 9 can proceed — see build order §3 in reconciliation). If A has not landed, coordinate: A is responsible for exposing `getDocAccess`/`authorizeDocRoute` before H Task 9 starts; do not stub a local copy.
- [ ] **WIRE routes:** update all H route handlers to `import { getDocAccess, authorizeDocRoute } from '@/lib/authz/doc-access'`. Every comment/edit/suggest/manage route calls `getDocAccess` or `authorizeDocRoute` — never re-checks `doc.ownerId` inline, never calls a local `getDocAccess` from `src/lib/docs/access.ts`. Remove any existing inline `doc.ownerId !== user.id` checks in comment routes and replace with the A-owned gate.
- [ ] **RED (integration — bar #5 probe):** `tests/integration/doc-access.test.ts` proves H's *call-sites* behave correctly: a `view` shareGrant → only `canView`; `comment` → `canView+canComment`; `edit` → +`canEdit`; `canManage` false for all share grants; no user + no grant → all false. These assertions validate the imported function's contract as H depends on it. Watch fail (A module absent or mismatched interface).
- [ ] **GREEN:** once A's module is present, tests pass by consuming `getDocAccess` from `@/lib/authz/doc-access` — H adds NO implementation logic here. Deliverable: `getDocAccess`/`authorizeDocRoute` from `@/lib/authz/doc-access` are the ONLY authorization source in all H routes; no `src/lib/docs/access.ts` file exists anywhere in the repo; integration tests green.

---

## Phase 3 — Comments over a share link + @mention notifications

### Task 9 (COMMENTS-API): permission-based comment routes (view link CANNOT comment)

**Files:** modify `src/app/api/docs/[id]/comments/route.ts` + `.../[commentId]/route.ts`; **add** `src/app/api/share/[token]/comments/route.ts`; test `tests/integration/comments-perms.test.ts`.

Today the comment routes are owner-only. Two changes: (a) the owner-auth route uses `getDocAccess` instead of the inline `ownerId` check (so Group A editors/commenters work); (b) a NEW share-scoped comment route lets a `comment`/`edit` link comment, and **rejects a `view` link**.

- [ ] **RED (integration, the bar #5 test):** POST to `/api/share/[token]/comments` with a **`view`** token (no cookie) → `403`. With a **`comment`** token → `201` and the comment row is created with `authorId: null` (anonymous-via-link) and the doc id from the token's share. With an **expired** `comment` token → `404`/`403` (bar #6). Watch fail.
- [ ] **RED:** GET `/api/share/[token]/comments` with a `view` token → returns the thread list READ-ONLY (viewers can see comments? — **decision:** a `view` link can READ comments, cannot create; a `comment` link can do both. Pin this). Watch fail.
- [ ] **GREEN:** implement the share-scoped route: resolve token → `resolveShareGrant` → `getDocAccess({shareGrant})` → gate GET on `canView`, POST on `canComment`. Reuse `createThread`/`addReply`/`listComments`. The owner route: swap the `doc.ownerId !== user.id` lines for `const access = await getDocAccess({user}, id); if (!access.canView) return 404; … if (!access.canComment) return 403` on POST. Anchors: the share route accepts `anchorStart`/`anchorEnd` JSON + integer fallback identically to the owner route. Deliverable: every perms case green; the view-link-cannot-comment bar is proven server-side with no cookie present.

---

### Task 10 (COMMENTS-PERSIST): store + re-apply durable anchors; persist anchor JSON

**Files:** modify `comments-repo.ts`, both comment routes, `CommentsSidebar.tsx`; tests `tests/integration/comments.test.ts` (extend) + a jsdom test for the sidebar re-anchor.

- [ ] **RED (integration):** `createThread` persists `anchorStart`/`anchorEnd` (JSON) alongside `anchorFrom`/`anchorTo`; `listComments` returns them. Watch fail.
- [ ] **GREEN:** thread the two new fields through `createThread` and the route payloads. `CommentsSidebar.handleAddComment` now calls `serializeAnchor(editor, from, to)` and sends BOTH the JSON anchor and the integer fallback; on load it calls `resolveAnchor` (JSON first, integer fallback when JSON is null/legacy) to (a) re-apply the transient `CommentMark` and (b) compute each card's vertical offset. A thread whose `resolveAnchor` returns `null` renders in an "Orphaned" group (the anchored text was deleted) instead of vanishing.
- [ ] **RED (jsdom):** mount the sidebar against an editor, seed a comment with a JSON anchor, edit text BEFORE the anchor, fire `editor.on('update')` → assert the re-resolved highlight still wraps the original target text (re-uses Task 3 machinery end-to-end). Watch fail → GREEN.
- [ ] **CONFIRM markdown purity:** assert (`tests/unit/markdown-parse.test.ts` or a new assertion) that serializing the doc to `markdown` does NOT emit the `comment` mark / `data-thread-id` — comments stay DB-only, sidecar stays clean. Deliverable: anchors persist + re-apply + survive edits; markdown stays comment-free.

---

### Task 11 (MENTIONS→NOTIFY): @mention fires a notification via Group B

**Files:** create `src/lib/docs/comment-notify.ts`; modify `comments-repo.ts` (`createThread`/`addReply`); test `tests/integration/comment-notify.test.ts` (mock the Group B sender).

The schema already stores `mentions` and `parseMentions` extracts `@username`. Wire mentions → a notification through Group B's email/notification dispatch (coordinate: B exposes a `sendNotification`/email sender; H calls it, does not build SMTP).

- [ ] **RED (integration):** creating a comment whose body mentions `@alice` (an existing user) calls the notification sender once with `{ recipient: alice, docId, snippet, authorName, kind: 'comment_mention' }`; mentioning a non-existent username sends nothing; mentioning the author themselves sends nothing (no self-notify). Watch fail.
- [ ] **GREEN:** `notifyMentions(docId, authorId, body, mentions)`: resolve each mention to a `users` row by name (de-dup), drop the author, and for each call `sendNotification` from `@/lib/notifications/send` (Group B builds and owns this module — see §1e of reconciliation) **non-blocking** (mirror the existing `fireCommentCreated` `void`-ed best-effort pattern so a mail failure never fails comment creation). H does NOT create `src/lib/notifications/send.ts`; it imports from B's module. B guarantees `sendNotification` gracefully no-ops when SMTP is unconfigured — H relies on that contract. Coordinate: B must expose `sendNotification` before H Task 11 ships; H is blocked on B's `@/lib/notifications/send` being present. Deliverable: mention-notify cases green (mock B's sender in the unit test); comment creation never blocks on mail; no local `src/lib/notifications/send.ts` in H's files.

---

## Phase 4 — Publish-to-web (read-only public page)

### Task 12 (PUBLISH): a "publish to web" share that renders read-only via `render-pm`

**Files:** modify `ShareViewer.tsx`, `share/[token]/route.ts`, `ShareDialog.tsx`; optionally a thin `src/app/p/[token]/page.tsx` (clean "published" URL aliasing the share route). Tests: `tests/unit/share-link.test.ts` (extend), a jsdom `ShareViewer` test, `tests/integration/publish.test.ts`.

H2 reuses the existing share renderer — the main work is presenting a polished read-only **published** page and surfacing comments read-only when the link permits.

- [ ] **RED (integration):** the public data path returns `comments` (read-only thread list, resolved excluded by default) **only when** the share's capabilities include `canView`-comments (a `view` link includes the read-only comment list; an anonymous viewer never sees author emails — only display names/initials, never `authorId` raw). A `view` publish link still returns `200` read-only doc. Watch fail.
- [ ] **GREEN:** extend the share POST response with an optional `comments` array (safe shape: `{id, threadId, body, authorName|null, resolved, createdAt, anchorStart, anchorEnd}` — NO `authorId`, NO email). `ShareViewer`: render the doc via `renderReadOnlyDoc` (unchanged, XSS-safe) and, when comments are present, render anchored comment highlights + a read-only margin list (resolve anchors client-side is not possible without the Y.Doc on the public page — so the public viewer positions comments by the **integer fallback** `anchorFrom`/`anchorTo` against the rendered prose, accepting minor drift on a stale published snapshot; document this limitation). Replace the "view-only in v0.1" note: for a true `view` publish link show nothing; for a `comment`/`edit` link the public viewer stays read-only in H2 unless H3's authenticated-share-edit (Task 15) is enabled — keep the copy accurate.
- [ ] `ShareDialog`: add a "Publish to web" affordance that creates a `view` share and shows the public URL + copy button (reuses `createShare`). Deliverable: published page renders read-only with optional read-only comments; no owner/email leak; integration + jsdom green.

---

## Phase 5 — Real-time presence (cursors + avatars)

### Task 13 (HARNESS): two-client collab test harness

**Files:** create `tests/unit/collab-harness.ts` (a helper, not a test file — exports `makePeer()` returning `{editor, ydoc, syncTo(other)}` built on `Y.Doc` + `Collaboration` + an in-memory awareness, no network). Consumed by Tasks 3/6/14.

- [ ] Build `makePeer(initialContent?)`: a Tiptap editor bound to a fresh `Y.Doc`, plus `syncTo(peer)` = `Y.applyUpdate(peer.ydoc, Y.encodeStateAsUpdate(this.ydoc))` both directions, and an awareness pair (`new awarenessProtocol.Awareness(ydoc)`) wired so `setLocalStateField` on one is observable on the other after a manual `applyAwarenessUpdate`. This is the in-process stand-in for two browsers. Deliverable: a smoke test (two peers, type on each, converge) green; the helper is importable.

### Task 14 (PRESENCE): cursors + avatar cluster correctness under multi-client

**Files:** modify `Editor.tsx` (presence cluster), `src/lib/editor/reading-presence.ts` (already has `collectReaders`); extend `tests/unit/reading-presence.test.ts`; add a presence-cluster jsdom test.

Presence is already wired (`setAwarenessField('user'|'reading')`, `CollaborationCaret`). Harden + finish the avatar cluster of who's editing/viewing.

- [ ] **RED:** extend `reading-presence.test.ts`: `collectReaders` over a 3-state awareness map (self + 2 remotes, one stale > `staleMs`) returns exactly the 1 fresh remote, sorted by pos; a remote with a `user` but no `reading.pos` is excluded (already covered — confirm), and a remote with `reading.pos` but no `user.name` is excluded. Watch / confirm.
- [ ] **RED (cluster):** a `presenceCluster(states, selfClientId, now)` pure helper → de-duplicated list of `{name, color, editing: boolean}` (editing = has a recent caret/selection field; viewing = reading-only). Watch fail.
- [ ] **GREEN:** implement `presenceCluster`; render it in the title bar next to `UserCluster` (show up to N avatars + "+k", coloured by `authorColor`, with `title`/`aria-label` = name, and a viewing/editing affordance). Reuse the existing throttle + awareness publish. **Verify caret colour stability**: two clients get distinct colours (the palette + `authorColor(userId)` hash already guarantees this — assert two different ids → different palette entries in a test). Deliverable: presence cluster renders all live participants; staleness + dedup + colour-distinctness green.

---

## Phase 6 — (Optional, scoped) authenticated edit/suggest over a share link

### Task 15 (SHARE-EDIT): edit-permission share link can edit via collab — server-gated handshake

**Files:** modify `collab/server.ts` (`onAuthenticate`), `Editor.tsx` (pass a share token to the provider), `src/app/api/share/[token]/route.ts` (mint a short-lived collab token); test `tests/integration/share-edit-auth.test.ts`.

> **Scope gate:** This is the one part of H that is genuinely new infrastructure (the collab server has no auth today). If the v0.2.0 timeline is tight, ship H1–H4 (comments, suggestion mode, publish, presence) and the read-only/comment share paths first, and treat Task 15 (anonymous **document editing** over an `edit` link via the live Y.Doc) as the stretch item — the SPEC's H3 lists permission *levels*; comment-level is fully delivered by Tasks 7–11, and edit-level read/comment is delivered; live anonymous co-editing is the increment here. **Flag for the user at planning review.**

- [ ] **RED (integration):** Hocuspocus `onAuthenticate({token, documentName})` rejects (throws) when the token does not resolve to a share grant whose `documentName` (doc id) matches and whose capability includes `canEdit`; accepts for a valid non-expired `edit` token; rejects an expired token (bar #6 at the WS layer). Watch fail.
- [ ] **GREEN:** add `onAuthenticate` to the server: parse `token`, `resolveShareGrant(token)` (import the repo with the same relative-path convention the server already uses), require `grant.share.docId === documentName && grant.capabilities.canEdit`. The client passes the token to `new HocuspocusProvider({ token })` only on the share-edit route. The owner editor continues with the session (add a parallel owner-auth branch in `onAuthenticate` that accepts the session cookie/PAT, OR keep owner traffic unauthenticated on the loopback and require tokens only for external share connections — **document the chosen trust boundary**; the safe default is: authenticate ALL connections, owner via a minted session-scoped collab token from the doc page). Deliverable: WS auth gates edit-over-share; expired/view tokens cannot open an editable socket; no regression to owner editing.

---

## Phase 7 — UI, polish, docs

### Task 16 (UI): suggestion-mode toggle + accept/reject affordances in the toolbar

**Files:** modify `Toolbar.tsx`/`MenuBar.tsx` (toggle `setSuggesting`), surface `SuggestionsPanel` alongside `CommentsSidebar`; jsdom interaction test.

- [ ] **RED → GREEN:** a "Suggesting" toggle (reflects `editor.storage.suggesting.enabled`, `aria-pressed`), and per-change Accept/Reject already in `SuggestionsPanel` wired to `acceptChange`/`rejectChange`. Ensure tint colours use tokens (`--success`/`--error`) in light + dark + dark-page (the v0.1.10 sweep covers this — re-verify the marks render legibly on `[data-page-bg="dark"]`). Deliverable: toggle works; panel accept/reject drives the doc; tints legible every scheme.

### Task 17 (DOCS + VERSION): changelog, help content, version bump

**Files:** `package.json`, `src/lib/version.ts`, `src/lib/help/content.ts`.

- [ ] Bump version; prepend a structured CHANGELOG entry covering H1–H4 (comments + suggestion mode, publish-to-web, share permission levels + expiry, real-time presence); add a short "Collaboration" help section. Deliverable: version consistent across both files; guide renders the new entry.

---

## Phase 8 — End-to-end browser verification (DOM probes, NOT screenshots)

### Task 18 (BROWSER): live DOM-probe verification of comments + presence + permissions

**Files:** `tests/e2e/collaboration.spec.ts` (Playwright; the repo already runs `e2e-a11y`).

Per bar #7, verify in a real browser by **querying the DOM / awareness state**, never screenshots.

- [ ] **Comments:** open a doc, select text, add a comment → assert `document.querySelector('span[data-thread-id]')` exists over the selection and a thread card with the body text is in the comments aside; resolve → the thread leaves the "open" filter and the mark is removed; reply → the reply appears.
- [ ] **Anchor survival (single-browser proxy):** add a comment on "world", then type text before it via the editor, and assert (via `page.evaluate` reading the editor doc + the re-resolved highlight) the highlight still wraps "world".
- [ ] **Presence (two contexts):** open the same doc in two Playwright browser contexts (two `currentUserName`s — needs Group A multi-user, OR two tabs as the same user for the awareness-size check); assert `await page.evaluate(() => __provider.awareness.getStates().size)` ≥ 2 and the presence cluster shows ≥ 2 avatars, and that a remote caret element (`.collaboration-carets__caret` / the CollaborationCaret label) is present. (Expose the provider on `window` in dev only, behind a `NODE_ENV !== 'production'` guard, for the probe.)
- [ ] **Permission enforcement (network, no UI):** from the test, `fetch` POST `/api/share/[viewToken]/comments` and assert `403`; POST with a `commentToken` and assert `201`; hit an expired token and assert `404`. (This re-proves bars #5/#6 against the running server, end-to-end.)
- [ ] Deliverable: e2e spec green in CI; comment thread + presence + permission gating all verified via DOM/awareness/network probes.

---

## Open questions for planning review (raise with the user before building)

1. **Comment anchoring strategy (RESOLVED here, confirm):** durable anchors = **Yjs RelativePosition JSON** in new `anchor_start`/`anchor_end` jsonb columns (survives concurrent edits via CRDT item identity), with integer `anchorFrom`/`anchorTo` retained as a **fallback** for the non-collab editor and for the **public published page** (which has no Y.Doc, so it positions comments by the integer offsets against a possibly-stale snapshot — minor drift accepted, documented in Task 12). Confirm the integer-fallback drift on the public page is acceptable, or require re-snapshotting anchors at publish time.
2. **Suggestion-mode × Yjs (RESOLVED here, confirm):** insertion/deletion are ProseMirror **marks in the doc content**, so they sync through Yjs natively and need **no** suggestion-specific awareness, locking, or extra CRDT plumbing; accept/reject is a local transaction the CRDT merges. Task 6 *proves* convergence under interleaved two-client editing. The only residual hazard (accept while a peer types inside the same insertion run) is tested; confirm the "marks-as-content, no locking" approach is acceptable vs. a heavier dedicated change-tracking CRDT.
3. **Anonymous live co-editing (Task 15) scope:** is full anonymous **document editing** over an `edit` share link in-scope for v0.2.0, or do we ship comment-level + read-only publish now and defer live anonymous co-editing? This is the only piece needing NEW collab-server auth (`onAuthenticate`) and a minted-token trust boundary.
4. **Group A dependency ordering (RESOLVED — do not re-open):** H does NOT build `getDocAccess`. Per §1c of the reconciliation, A owns `src/lib/authz/doc-access.ts` and must ship both `getDocAccess` and `authorizeDocRoute` before H Task 9 begins. H is sequenced after A in the build order (see reconciliation §3). If A is delayed, escalate — H must NOT create a local `src/lib/docs/access.ts` even as a temporary stand-in.
5. **Group B dependency (RESOLVED — do not re-open):** B owns `src/lib/notifications/send.ts` and must expose `sendNotification` before H Task 11 ships. H imports from `@/lib/notifications/send` and codes to that contract. H must NOT define or stub a local `src/lib/notifications/send.ts`.
6. **Public viewer comment visibility:** a `view` publish link shows comments **read-only** (display names/initials only, never emails/`authorId`); a `comment` link can also create. Confirm viewers should see existing comments at all (alternative: comments visible only to `comment`+ links).
