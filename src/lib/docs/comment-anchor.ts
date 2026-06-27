// ── H1 — Durable comment anchoring ─────────────────────────────────────────
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
// `assoc` convention — the LOCKED requirement is closed-interval behaviour: a
// concurrent edit BEFORE the anchor shifts it (it stays over the same chars), and a
// prefix insert EXACTLY at the comment-start boundary lands OUTSIDE the anchor (no
// prefix absorption). The plan named the assoc integers as start=-1/end=0, but
// y-prosemirror@1.3.7's `absolutePositionToRelativePosition(pos, type, mapping)`
// takes NO assoc argument — it hard-codes assoc internally (`type.length === 0 ? -1
// : 0`), so the integers cannot be set through that helper. What its built-in
// behaviour DOES guarantee (verified in comment-anchor.test.ts) is exactly the
// locked, load-bearing requirement: the start boundary is left-closed (a prefix
// insert at `from` stays out) and the anchor tracks concurrent inserts/deletes
// before it. The ONLY residual is that a suffix insert landing at the EXACT end
// boundary `to` extends the highlight by that one char — a cosmetic, non-data-
// integrity artifact (the comment still covers the original text, plus the one
// just-typed trailing char). We accept this rather than reimplement y-prosemirror's
// PM→Yjs index traversal (fragile across node boundaries) to force end assoc -1.
// Orphan detection (resolveAnchor → null) covers the deletion case below.

import type { Editor } from '@tiptap/core'
import {
  absolutePositionToRelativePosition,
  relativePositionToAbsolutePosition,
} from 'y-prosemirror'
import * as Y from 'yjs'
// AnchorJson is the canonical `relativePositionToJSON` boundary shape; it lives in
// the client-safe shared module so both the repo row type and these helpers agree.
import type { AnchorJson } from '@/lib/docs/comments-shared'

export type { AnchorJson }

// y-prosemirror's `ProsemirrorMapping` is not exported as a named type, so derive
// it from the helper's parameter list to stay strictly typed (no `any`).
type ProsemirrorMapping = Parameters<typeof absolutePositionToRelativePosition>[2]

// The y-prosemirror ySync binding (fields used here: .type = the bound XmlFragment,
// .mapping = the prosemirror↔yjs node map, .doc = the Y.Doc). Not exported by the
// package's d.ts as a named type, so we describe the shape we read.
type YSyncBinding = {
  type: Y.XmlFragment
  mapping: ProsemirrorMapping
  doc: Y.Doc
}

// Locate the y-prosemirror ySync plugin by SCANNING the registered plugins for the
// one whose state carries a `binding`. We CANNOT key off a fixed string:
// y-prosemirror's plugin key is `createKey('y-sync')`, and the GLOBAL ProseMirror
// PluginKey counter means the registered key is `y-sync$` OR `y-sync$1`, `y-sync$2`,
// … depending on how many PluginKey('y-sync')s were constructed at module-eval time
// (importing y-prosemirror HERE — for the relpos helpers — itself constructs one,
// bumping the counter, so the editor's bundled ySync plugin can register as
// `y-sync$1`). Scanning for the binding-bearing plugin is the only resolution-stable
// approach. We match a plugin whose key starts with `y-sync` AND whose state exposes
// a `binding` with the fields we read.
type PluginWithState = {
  getState: (state: unknown) => unknown
}

function isYSyncBinding(b: unknown): b is YSyncBinding {
  return (
    !!b &&
    typeof b === 'object' &&
    'type' in b &&
    'mapping' in b &&
    'doc' in b &&
    (b as { type: unknown }).type != null
  )
}

function getBinding(editor: Editor): YSyncBinding | null {
  // The ySync binding is created in the plugin's `view()` lifecycle (once the
  // EditorView is realized) and stored on the plugin state. We read it from
  // `editor.state` (the binding is shared across the editor/view state once built).
  const state = editor.state as unknown as {
    config?: { pluginsByKey?: Record<string, PluginWithState> }
  }
  const byKey = state.config?.pluginsByKey
  if (!byKey) return null

  for (const [key, plugin] of Object.entries(byKey)) {
    if (!key.startsWith('y-sync')) continue
    const ps = plugin.getState(editor.state) as { binding?: unknown } | undefined
    if (ps && isYSyncBinding(ps.binding)) return ps.binding
  }
  return null
}

/**
 * Serialize a PM selection range [from, to) to a durable RelativePosition pair.
 * Returns null when the editor is NOT collab-bound (no y-prosemirror binding) — the
 * caller then falls back to the integer `anchorFrom`/`anchorTo`.
 */
export function serializeAnchor(
  editor: Editor,
  from: number,
  to: number,
): { start: AnchorJson; end: AnchorJson } | null {
  const binding = getBinding(editor)
  if (!binding) return null

  const lo = Math.min(from, to)
  const hi = Math.max(from, to)

  // y-prosemirror chooses assoc internally (see the header note). Its built-in
  // behaviour gives the locked closed-start + concurrent-tracking semantics.
  const startRel = absolutePositionToRelativePosition(lo, binding.type, binding.mapping)
  const endRel = absolutePositionToRelativePosition(hi, binding.type, binding.mapping)

  return {
    start: Y.relativePositionToJSON(startRel) as AnchorJson,
    end: Y.relativePositionToJSON(endRel) as AnchorJson,
  }
}

/**
 * Resolve a stored RelativePosition pair back to an absolute PM range.
 * Returns null when the editor is not collab-bound OR the anchored text was deleted
 * (either boundary resolves to null) — the caller renders the thread as "orphaned".
 * Always clamps `from <= to`.
 */
export function resolveAnchor(
  editor: Editor,
  anchor: { start: AnchorJson; end: AnchorJson },
): { from: number; to: number } | null {
  const binding = getBinding(editor)
  if (!binding) return null

  const startRel = Y.createRelativePositionFromJSON(anchor.start)
  const endRel = Y.createRelativePositionFromJSON(anchor.end)

  const startAbs = relativePositionToAbsolutePosition(
    binding.doc,
    binding.type,
    startRel,
    binding.mapping,
  )
  const endAbs = relativePositionToAbsolutePosition(
    binding.doc,
    binding.type,
    endRel,
    binding.mapping,
  )

  // Either boundary unresolvable (deleted item, GC'd) → orphaned.
  if (startAbs === null || endAbs === null) return null

  const from = Math.min(startAbs, endAbs)
  const to = Math.max(startAbs, endAbs)

  // Deleted-content detection: Yjs keeps tombstones, so when the anchored text is
  // removed BOTH relative positions still resolve — but they collapse onto the same
  // absolute position. A comment always anchors a non-empty selection, so a
  // zero-width resolved range means the highlighted text is gone → orphaned. The
  // caller renders the thread in the "Orphaned" group rather than over a 0-px span.
  if (from === to) return null

  return { from, to }
}
