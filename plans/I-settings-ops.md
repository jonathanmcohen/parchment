# Plan I — Settings / admin / ops (TIER 6)

Hangs off the A3 settings shell.

- **I1** Theme: light / dark / follow-system. Accent picker (8 swatches + custom hex + live preview). Page background (white/sepia/custom). Font-pair preset gallery.
- **I2** Keyboard shortcuts: full cheat sheet at ⌘⇧/ (mirror Cairn UX). Customizable bindings. Vim-mode optional for source pane (CodeMirror keymap).
- **I3** Autosave cadence slider 5s–5min (drives D3 default).
- **I4** Backup: workspace `.zip` export (docs + history + metadata + tags + smart folders); scheduled backups to S3-compatible (UI: endpoint/bucket/keys/test-connection — Cairn CFG-2 pattern); restore-from-archive. *FM:* failed S3 test shows error, never silently "saved".
- **I5** Audit log — **= A4** (single impl).
- **I6** Health page — **= A5** + Ollama (if configured) + S3 (if configured) pills.
- **I7** MFA + passkeys (reuse Cairn lib).
- **I8** SSO / SCIM scaffolded for v0.2 — **route stubs only** at v0.1.
- **I9** Help menu (?) in sidebar footer: Replay tour / Keyboard shortcuts / What's new (release-notes drawer).
- **I10** Schedules: same shape as Cairn Settings → Admin → Schedules. In-process scheduler **ON BY DEFAULT, NO env flag required** — do not repeat the Cairn CFG-3 mistake. *Accept:* fresh install runs scheduled jobs with zero config.
