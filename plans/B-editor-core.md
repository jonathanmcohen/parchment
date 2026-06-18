# Plan B — Editor core (TIER 1)

Tiptap/ProseMirror surface. Page-bounded canvas is the spine — B1 first, rest hang off it.

- **B1** Page canvas: `@page` CSS + paged.js polyfill. US Letter 8.5×11 default, 1in margins. A4 toggle in page-setup. Per-section margin + orientation. *Accept:* content flows across page boundaries; print preview matches screen.
- **B2** Inline bar: B/I/U/S, sub, super, inline code, highlight, text color, font family, font size (pt+px), line height, letter spacing. *Accept:* each mark round-trips to markdown/canonical store.
- **B3** Block formatting: H1–H6, paragraph, blockquote, code block (auto-detect + manual lang), bullet/numbered/checkbox lists, multi-level outlines, alignment, first-line indent.
- **B4** Tables: insert, resize cols, merge cells, header row, alt-row shade, sort by column, formula cells `=SUM/AVG/AVERAGE/COUNT`, ranges `A1:A10`. *FM:* circular formula ref → error cell, not hang.
- **B5** Images: paste/drag/upload, position (inline/wrap-left/wrap-right/break/behind), resize handles, crop, **alt text REQUIRED on insert**, lock aspect. *Gate:* insert blocked without alt (ties K1).
- **B6** Links: auto-detect URLs, named link, link to heading in-doc, link to other Parchment doc (fuzzy search picker).
- **B7** Auto TOC: `/toc` block, refresh button, optional page numbers + leader dots.
- **B8** Footnotes + endnotes: `[^1]` syntax, numbered, click-jump, footer or end-of-doc per-section.
- **B9** Find + replace: case sensitive, whole word, regex, replace all, scope selection/doc, ⌘F / ⌘⇧H. *FM:* bad regex → inline error, no crash.
- **B10** Word + char count: live status bar, selection-scoped on highlight, reading-time estimate.
- **B11** Outline pane: collapsible left rail, click-jump, drag-reorder (moves whole subtree between headings).
- **B12** Slash menu: `/` opens insert; categories BASIC/TEXT/LISTS/MEDIA/EMBED/ADVANCED; left category rail. Conservative option set (Google-Docs feel).
- **B13** Page primitives: page numbers (footer, configurable position/format), running headers+footers per-section, manual `/pagebreak`, section breaks.
- **B14** Page setup dialog: in/cm toggle, custom margins, orientation per-section, size Letter/A4/Legal/Tabloid/Custom.

Every item: Coverage + Failure-modes gates before lock.
