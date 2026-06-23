# Plan S3 — Editor chrome (title bar, menu bar, toolbar)

> ⛔ HOLD. Run after S2. The heaviest plan — introduces two NEW chrome rows
> (title bar, menu bar) + a full toolbar restyle. **S3-2 is the PARTIAL risk:**
> the File/Edit/View/Insert/Format/Tools/Extensions/Help dropdown system likely
> needs a new shared menu component; if it can't be 100% in-window, mark S3-2
> `PARTIAL (n%)` with the menus shipped, never `DONE`.

**Likely files:** new `DocTitleBar`, `MenuBar` + per-menu dropdown configs, restyle
`src/components/editor/Toolbar.tsx`, the outline component, the status bar; wire
existing actions (export registry, version history, comments, find/replace, voice,
citation, AI compose) into the menu/toolbar — **no new feature logic, only surfacing.**

---

### S3-1 — Doc title bar (NEW)
Pinned top of editor route, 56px, white, 1px bottom border `#E8EAED`. Left→right:
24px blue doc glyph (→ Files) · editable inline title (18px Google Sans,
click-to-edit, autosave on blur, truncate+tooltip) · star toggle (☆→★ blue) ·
move-to-folder icon · save status ("All changes saved to disk" / "Saving…") ·
spacer · comments icon (+count badge) · history clock (→ version drawer) ·
**Share button** (rounded `#1A73E8`, white, 16px people icon, 36px) · avatar (S2-5).
**Accept:** title bar present + every control wired to its existing action.

### S3-2 — Menu bar (NEW)  ⚠ PARTIAL risk
Thin row below title bar, 32px, white, 1px bottom border `#E8EAED`. Items: File ·
Edit · View · Insert · Format · Tools · Extensions · Help (14px, 8px padding, hover
gray pill, Material dropdowns). Menu contents — all surfacing EXISTING actions:
- **File:** New (Blank / From template) · Open · Make a copy · Move to folder ·
  Move to trash · Version history · Download (Markdown/HTML/Plain text/Word .docx/
  EPUB/LaTeX/PDF) · Email (stub) · Page setup · Print.
- **Edit:** Undo · Redo · Cut/Copy/Paste/Paste-without-formatting · Select all ·
  Find and replace (⌘F / ⌘⇧H).
- **View:** Print layout · Pageless · Show ruler · Show outline · Show document tabs · Full screen.
- **Insert:** Image · Table · Drawing · Chart · Horizontal line · Footnote ·
  Equation · Special characters · Page break · Header/Footer/Page number · Link · Comment.
- **Format:** Text (B/I/U/Strike/Super/Sub) · Paragraph styles (Title/Subtitle/H1–6/
  Normal) · Align & indent · Line & paragraph spacing · Columns · Bullets & numbering ·
  Headers & footers · Page numbers · Clear formatting.
- **Tools:** Word count · Voice typing · Citation · Spell check · Grammar suggestions ·
  Personal dictionary · Translate document · AI compose.
- **Extensions:** Add-ons (placeholder) · Apps Script (placeholder → Plugins).
- **Help:** Keyboard shortcuts (⌘/) · Replay tour · Updates / What's new · About Parchment.
**Accept:** each menu opens a Material dropdown; every NON-placeholder row triggers
its real action. Placeholders are visibly disabled/"coming soon", not dead.

### S3-3 — Editor toolbar restyle
Single 48px white row, 1px bottom border `#E8EAED`, pinned below the menu bar; drop
the dark theme. Order: Undo · Redo · Print · Spell check · Format painter · Zoom
dropdown · | · **Styles** dropdown (Normal/Title/Subtitle/H1–6) · | · **Font**
dropdown (Arial default + Calibri/Cambria/Comic Sans MS/Courier New/Georgia/
Helvetica/Times New Roman/Trebuchet MS/Verdana + "More fonts…") · Font size (`−`/`+`
chip, 12px input) · | · **B I U S** · Text color · Highlight · | · Link · Comment ·
Image · | · **Align** dropdown · **Line spacing** dropdown · Bulleted · Numbered ·
Outdent · Indent · Clear formatting · | · Editing-mode dropdown (Editing/Suggesting/
Viewing, right-aligned — S5-10). Overflow `⋯` rightmost at narrow widths. Icons 20px,
hover pill `#F1F3F4`, active pill `#E8F0FE` blue. **Accept:** light toolbar in the
stated order; overflow collapses cleanly; each control wired.

### S3-4 — Drop the export-format text strip
Remove the Markdown/HTML/Plain text/Word/EPUB/LaTeX/PDF strip; all export routes
live under File → Download (S3-2). **Accept:** no standalone export strip; downloads
reachable from File → Download. (Depends S3-2.)

### S3-5 — Outline pane redesign
Light bg `#F8F9FA`, 1px right border, 256px, collapsible. A left-rail INSIDE the
editor route (between global sidebar and canvas), NOT floating dark. Header "Outline"
+ chevron. Heading rows 14px Roboto, indent by level (H1 0 / H2 12px / H3 24px),
active row light-blue bg. Toggle via View → Show outline (S3-2). **Accept:** outline
is a light left-rail; active heading highlighted; View toggle hides/shows it.

### S3-6 — Bottom status bar restyle
24px, white, 1px top border, full width. Left: "Page 1 of 1". Center: word count
(small, click → Tools → Word count modal). Right: editing-mode hint + connection
dot. Drop "1 min read" by default (surface via Tools → Word count). **Accept:**
slim white status bar with page/word/mode/connection; no read-time by default.

---

## Coverage check
- Audit gaps closed: missing Docs title bar (S3-1) + menu bar (S3-2), dark/ad-hoc
  toolbar (S3-3), export strip clutter (S3-4), floating-dark outline (S3-5), heavy
  status bar (S3-6).
- Cross-plan: title-bar Share/avatar reuse S1 blue + S2-5 cluster; save-status copy
  = S5-9; editing-mode dropdown is S5-10 placed by S3-3; menu/toolbar icons = S4-3;
  dropdown elevation = S5-3; export actions = the existing H export registry (no new
  formats). **Every menu/toolbar entry maps to an action that already exists** — if
  one doesn't, it's a placeholder (Extensions, Email), explicitly marked.
- Out of scope: the actual export/voice/AI logic (shipped in v0.1.0) — S3 only
  surfaces it. New page-setup/columns UI that doesn't exist yet → if a Format/Insert
  row has no backing feature, it's a disabled placeholder, and S3-2 drops to PARTIAL.

## Failure-modes-verified
- **Dead menu rows** (a menu item wired to nothing) → per-PR live click-through of
  every non-placeholder row; a row that no-ops is a defect, not DONE.
- **Placeholder honesty** (Email/Extensions/Translate look real but aren't) →
  they render visibly disabled / "coming soon"; S3-2 logged PARTIAL with the exact
  shipped-vs-placeholder list + percent.
- **Toolbar overflow breakage** (the `⋯` drops or duplicates controls at narrow
  widths) → responsive snapshots at 3 widths; the overflow menu must contain exactly
  the hidden controls, once each.
- **Title autosave race** (inline-title blur vs the doc autosave) → verify a title
  edit saves without clobbering body content (the I4 createDocument/markdown lesson).
- **Outline rebuild loop / staleness** (the G7 infinite-loop + G8 node.type lessons)
  → outline updates only on `docChanged`; headings resolve from live PM nodes, not
  JSON-shape assumptions.
- **Menu/toolbar a11y** (role=menu, arrow-nav, Esc, focus restore — G15/K3) → axe +
  keyboard walk of the menu bar and every dropdown.
- **Chrome height stack** (title 56 + menu 32 + toolbar 48 pushing the canvas
  off-screen) → snapshot the editor at idle; canvas + status bar must remain visible.
