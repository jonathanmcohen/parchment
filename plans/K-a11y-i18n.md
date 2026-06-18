# Plan K — Accessibility + i18n (TIER 8)

Release gate, not an afterthought. K4 blocks the tag.

- **K1** ARIA structure, semantic HTML, alt text **required** on image insert (ties B5).
- **K2** High-contrast theme + dyslexia-friendly font (OpenDyslexic) toggle in Account → Theme.
- **K3** Keyboard-only navigation: every menu reachable without mouse; visible focus ring; skip-to-content link.
- **K4** axe-core a11y harness on every release: each top-level page becomes a Playwright a11y target (Cairn A11Y-1..5 pattern). *Gate:* zero violations or the tag job fails.
- **K5** i18n via next-intl. RTL support (Arabic / Hebrew). *Accept:* RTL locale mirrors layout, editor caret behaves.
- **K6** Spell check: browser-native + custom dictionary per workspace.
- **K7** Grammar check: LanguageTool integration (UI for host URL + key).
