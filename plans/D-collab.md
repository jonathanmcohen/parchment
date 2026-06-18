# Plan D — Collab / review (TIER 1 + 2)

Yjs + Hocuspocus, same pattern as `cairn-collab`. v0.1 is single-user, but the collab substrate ships now (presence visible only when a second tab/PAT joins).

- **D1** Comment threads: anchor to selection, threaded replies, resolve, @-mention, filter open/resolved/mine. *FM:* anchor survives edits around it; orphaned anchor degrades gracefully.
- **D2** Suggesting mode (track changes): every edit → tracked suggestion (insert/delete/format-change), per-change accept/reject, accept-all, side-by-side diff, author colors. *Accept:* reject restores exact prior bytes.
- **D3** Version history: autosave every 30s + named snapshots; visual diff between any two versions; restore any version; unified markdown diff too (ties F5).
- **D4** Real-time multi-cursor + presence (Yjs awareness). *Accept:* two tabs show each other's cursor + selection.
- **D5** Collaborative reading position: see where teammates are scrolled in a long doc.

Autosave cadence configurable via I3 (default 30s here).
