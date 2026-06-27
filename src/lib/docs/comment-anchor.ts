// ── H1 — Durable comment anchoring (DECISION RECORD) ───────────────────────
//
// A comment's anchor is stored as a **Yjs RelativePosition pair serialized to
// JSON** (the new `anchor_start`/`anchor_end` jsonb columns), with the integer
// `anchorFrom`/`anchorTo` retained as a non-collab / migration fallback.
//
// WHY this representation (do NOT relitigate):
//   • CHOSEN — Yjs RelativePosition (relative to the doc's `default` XmlFragment).
//     `absolutePositionToRelativePosition(pmPos, binding.type, binding.mapping)`
//     → a Y.RelativePosition → `relativePositionToJSON` → store. On load,
//     `createRelativePositionFromJSON` → `relativePositionToAbsolutePosition` → an
//     absolute PM position. This is the ONLY representation that survives concurrent
//     edits: a RelativePosition binds to the Yjs item (character) identity, so an
//     insert/delete BEFORE the anchor shifts the resolved position automatically,
//     with no remap bookkeeping, even across offline merges. Same machinery as
//     cursor `getRelativeSelection`.
//   • REJECTED — integer PM positions only (current `anchorFrom`/`anchorTo`).
//     Absolute positions are invalidated by any edit before them; under
//     collaboration there is no single transaction to `.mapping.map()` through, so
//     they silently drift. Kept ONLY as the non-collab fallback + migration value
//     + the public published page (which has no Y.Doc).
//   • REJECTED — `comment` mark in the doc content. A mark WOULD move correctly,
//     but it stores thread state in the portable `.md` mirror (violates the locked
//     "DB, not sidecar" decision), bloats markdown round-trips, and makes "list all
//     comments" a doc-walk instead of a SQL query. We DO keep a TRANSIENT
//     `CommentMark` as a visual highlight only, re-applied from DB anchors on load,
//     never serialized to markdown.
//   • REJECTED — character offset into plain text. Breaks on any structural (node)
//     edit and on identical repeated substrings.
//
// `assoc` convention (LOCKED — closed-interval on both ends): `start` binds with
// `assoc: -1` (the relpos binds to the Yjs item to its RIGHT, so text inserted
// exactly at the comment-start boundary lands OUTSIDE the anchor — no prefix
// absorption). `end` binds with `assoc: 0` (binds to the item to its LEFT, so text
// inserted exactly at the comment-end boundary lands OUTSIDE — the anchor never
// silently grows). A comment over `[from, to)` stays over exactly those chars under
// all boundary insertions.
//
// This is the DECISION RECORD task — types only; the implementation lands in Task 3.

import type { Editor } from '@tiptap/core'

/** The JSON shape produced by Yjs `relativePositionToJSON` for one boundary. */
export type AnchorJson = Record<string, unknown>

/**
 * Serialize a PM selection range [from, to) to a durable RelativePosition pair.
 * Returns null when the editor is NOT collab-bound (no y-prosemirror binding) — the
 * caller then falls back to the integer `anchorFrom`/`anchorTo`.
 */
export declare function serializeAnchor(
  editor: Editor,
  from: number,
  to: number,
): { start: AnchorJson; end: AnchorJson } | null

/**
 * Resolve a stored RelativePosition pair back to an absolute PM range.
 * Returns null when the editor is not collab-bound OR the anchored text was deleted
 * (either boundary resolves to null) — the caller renders the thread as "orphaned".
 * Always clamps `from <= to`.
 */
export declare function resolveAnchor(
  editor: Editor,
  anchor: { start: AnchorJson; end: AnchorJson },
): { from: number; to: number } | null
