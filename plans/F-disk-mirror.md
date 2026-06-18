# Plan F — Disk mirror (differentiator, TIER 3)

The thing that makes Parchment not-just-another-editor. Docs are real files on disk, versioned in git.

- **F1** Every doc also a real `.md` at `~/parchment/files/<folder>/<file>.md`. Configurable root. *Accept:* create-in-app → file appears; folder moves mirror on disk.
- **F2** chokidar watcher: external edits sync back into DB + Yjs doc. Conflict detection if both sides edited concurrently. *FM:* simultaneous in-app + on-disk edit → conflict surfaced, neither silently lost.
- **F3** Markdown canonical form: round-trip lossless. Extension blocks (TOC, equation, drawing, suggestion-tracked changes) captured as fenced blocks with custom info string, e.g. ` ```parchment:toc `. *Accept:* export→reimport is byte-identical for the canonical subset.
- **F4** Per-doc git via `isomorphic-git`: every save autocommits (generated message); full git log; cherry-pick old version; branch a doc; merge. *FM:* merge conflict presented, not auto-clobbered.
- **F5** Plain-text unified diff alongside visual diff (shared with D3).
- **F6** `[[doc-name]]` wiki-style backlinks + autocomplete; backlinks panel. *Accept:* rename target updates inbound links or flags broken.
