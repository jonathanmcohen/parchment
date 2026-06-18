# Plan G — Tiers 2–8 (all, no deferrals)

The wide tier. 17 items, each independently shippable behind the editor + file manager.

- **G1** Sharing: link share (view / comment / edit / view-with-suggestions-only), per-email grants (**stub** v0.2), password-protected links, expiry, "anyone with link" toggle.
- **G2** Templates: bundled gallery (Letter/Memo/Resume/Meeting notes/Project brief/RFC/Lab notebook/Essay/Outline) + "Save as template" from any doc.
- **G3** Styles: named paragraph + character styles (Word-like), inherit chain, custom CSS theme per workspace, accent color, font-pairing presets (sans/serif/mono).
- **G4** Equation editor: KaTeX, inline `$…$` + display `$$…$$`, equation numbering, eq references.
- **G5** Drawing: Excalidraw embed, SVG output, editable on re-open.
- **G6** Diagrams: Mermaid + PlantUML + Drawio embeds, live preview.
- **G7** Citations: DOI lookup via CrossRef (reuse Cairn lib), CSL (APA/MLA/Chicago), auto bibliography block, cite-by-key autocomplete.
- **G8** Cross-references: figure/table/equation/heading number refs that auto-update on move.
- **G9** Watermark: text or image overlay (DRAFT/CONFIDENTIAL/custom logo) per-doc or per-section.
- **G10** Voice typing: Web Speech API, dictate into selected paragraph.
- **G11** PWA/offline: Service Worker caches docs, edit offline, sync on reconnect. *FM:* offline edit + remote edit → reconnect reconciles via Yjs, no loss.
- **G12** Mobile responsive editor: touch toolbar, page-fit view, swipe between pages.
- **G13** AI compose sleeve: local Ollama HTTP or remote (Anthropic/OpenAI). Selection → Improve / Shorten / Translate to… / Continue writing. Output enters as **Suggesting-mode tracked change**. No-key fallback to Ollama `http://homelab:11434` if env set.
- **G14** Smart paste: content-type sniffer routes Word / Google Docs / Notion HTML / web HTML / URL-with-og / plain markdown through dedicated normalisers.
- **G15** Reading mode: full-bleed, no chrome, reduced contrast, sepia/serif/wide-margin toggles, per-doc bookmark scroll.
- **G16** Presenter mode: F5 enters page-flip; arrow keys navigate; speaker-notes pane.
- **G17** Custom CSS per doc (power users).
