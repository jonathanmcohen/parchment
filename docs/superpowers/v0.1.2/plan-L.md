# Plan L — layout fixes (toolbar / title / menu / status bar / outline / page)

> ⛔ **HOLD.** No code until GO on F1+F2. Grounded against the v0.1.1 code. **Pure
> layout/CSS — no new feature logic, no handler changes.** Every chrome component
> already exists and is fully wired; L only re-positions them: full-width chrome,
> left-anchored outline, centered page in its own gutter, sticky top stack, pinned
> status bar. All colors are S1 tokens.

**The shared structural change.** Today the entire editor chrome lives inside one
centered column:
```
.parchment-editor-shell (bg: --editor-gutter, full bleed)   Editor.tsx wrapper, globals.css:390
  └─ <div class="mx-auto max-w-5xl">                         Editor.tsx:1418  ← the centering constraint
       ├─ DocTitleBar   (.parchment-titlebar, 56px)          :1422   globals.css:406
       ├─ MenuBar       (.parchment-menubar, 32px)           :1436   globals.css:503
       ├─ Toolbar       (.parchment-toolbar, 48px)           :1454   globals.css:1017
       ├─ flex row: OutlinePane (256px) + PageCanvas         :1500-1552
       └─ StatusBar     (.parchment-status-bar, 24px)        :1577   globals.css:914
```
The whole stack is clamped to `max-w-5xl` (~1024px) and centered, so the chrome
floats with dark gutters either side (the "card" look — though grounding confirms
there is **no rounded-card** class; the float is purely the `max-w-5xl` clamp on the
`--editor-gutter` shell). **L re-frames this into:** full-bleed sticky chrome (bg
edge-to-edge, content centered) on top, a **left-anchored** outline, a centered page
in a gutter, and a pinned full-width status bar.

**Pattern for "full-width bg, centered content"** (L1/L2/L3): the row's **background +
border** span the main content area edge-to-edge; an **inner** wrapper holds the icons/
text at a centered max-width. Concretely, lift each bar OUT of the `max-w-5xl` clamp so
its bg bleeds, and put a `mx-auto max-w-[Npx]` inner div around its content.

---

### L1 — Editor toolbar full-width

**Files:** `src/components/editor/Editor.tsx:1413-1484` (the `max-w-5xl` wrapper +
toolbar mount 1454-1484); `globals.css:1017-1033` (`.parchment-toolbar`).

**Current → Target:**
- Current: the 48px toolbar renders inside `mx-auto max-w-5xl`, so its bg + bottom
  border stop at ~1024px with dark gutter beyond; it is **not sticky.**
- Target: pinned **`position:sticky; top:56px`** (below the title bar), background +
  `--border-chrome` bottom border **edge-to-edge** of the main content area (from the
  right edge of the global sidebar to the viewport's right edge); the controls stay in
  a centered max-width inner container.

**Change:** lift the toolbar's bg/border to a full-bleed row; wrap the controls in a
centered inner div; add sticky + z-index (see L7 stack). **No handler changes** — all
~17 toolbar callbacks (`onInsertImage`/`onOpenLink`/… `Editor.tsx:1455-1483`) stay.

**Accept:** the toolbar bg spans full width with no dark side-gutters; it sticks below
the title bar on scroll; controls remain centered/legible. **Proves it:** surface **#2
(toolbar full-width)** baseline (light + dark); scroll — the toolbar stays pinned.

**Steps:** 1) RED #2 (centered ~865px toolbar). 2) Full-bleed bg + centered inner +
sticky `top:56px` + z-index. 3) Live-verify scroll + width. 4) Update #2 baseline.

---

### L2 — Title bar + menu bar full-width sticky

**Files:** `Editor.tsx:1413-1451` (title 1422-1429, menu 1436-1450);
`globals.css:406-507` (`.parchment-titlebar` 406-, `.parchment-menubar` 503-).

**Current → Target:**
- Current: both inside the `max-w-5xl` clamp, normal flow, not sticky.
- Target: title bar 56px edge-to-edge at the top (`sticky; top:0`), menu bar 32px
  edge-to-edge below it (`sticky; top:56px`), content centered. Same full-bleed-bg /
  centered-content pattern as L1.

**Change:** lift both bars out of the clamp; full-bleed bg + `--border-chrome` bottom
borders; centered inner wrappers; sticky + z-index (L7). **No handler changes**
(DocTitleBar/MenuBar props unchanged).

**Accept:** title + menu bars span full width, stack flush, stick on scroll; content
centered. **Proves it:** surface **#1 (editor idle)** baseline (light + dark) shows the
full-width stacked chrome.

**Steps:** 1) RED #1. 2) Full-bleed + centered inner + sticky (title `top:0`, menu
`top:56px`). 3) Verify scroll/overlap. 4) Update #1 baseline.

---

### L3 — Bottom status bar full-width

**Files:** `Editor.tsx:1575-1584`; `StatusBar.tsx:1-89`; `globals.css:914-927`.
**Pairs with F8.**

**Current → Target:**
- Current: the 24px status bar is inside the `max-w-5xl` clamp in normal flow (not
  pinned) — content stops at ~1024px.
- Target: pinned `position:fixed; bottom:0`, bg + top border **full-width edge-to-edge**,
  content centered (the three slots in a centered inner container).

**Change:** **execute with F8** (same pin) — full-bleed bg, centered inner, reserve
`padding-bottom:24px` on the scroll container. No count logic.

**Accept:** the status bar spans full width pinned at the bottom; content centered;
nothing clipped behind it. **Proves it:** surface **#5 (status bar pinned)** baseline
(light + dark).

**Steps:** see **F8** (single PR covers F8+L3).

---

### L4 — Outline pane anchored left, not floating

**Files:** `Editor.tsx:1500-1515` (outline mount, `open`/`onToggle` lifted to parent
`:576`/`:1513`); `OutlinePane.tsx:55-259` (title span 199, jump/drag handlers);
`globals.css:1804-1981` (`.parchment-outline*`; collapsed 1820-1824; title transform
1864-1870; chevron 1827-1847).

**Current → Target:**
- Current: the outline is a 256px in-flow flex child (`position:relative`, first in the
  flex row), **not sticky** — it scrolls with the page and overlaps the canvas region;
  collapse target is **32px**; the title is **uppercase 0.7rem** "OUTLINE".
- Target: **anchored** to the left edge of the editor viewport (right after the global
  sidebar), 256px, **`position:sticky; top:136px`** (below the chrome stack) to the
  status bar; `--surface-muted` (#F8F9FA light) bg, `--border-chrome` right border;
  collapse chevron `<` shrinks it to a **40px** rail with a `>` to re-open; title is
  **sentence-case "Outline" 13px medium** (drop the uppercase transform).

**Change:** **restyle only** — add `sticky; top:136px`; change collapsed width 32→40px
and keep the chevron visible in the rail; remove `text-transform:uppercase`, set 13px
medium. Heading collection / jump / drag handlers unchanged (preserve the v0.1.1 G7/G8
lessons — outline still rebuilds only on `editor.on('update')`).

**Accept:** the outline is anchored left (not overlapping the canvas), sticky through
scroll, `--surface-muted` with a `--border-chrome` right border; the chevron collapses
it to a 40px rail and re-opens; the title reads sentence-case "Outline".
**Proves it:** surface **#4 (outline anchored + collapsed rail)** baseline (light +
dark, both states); axe keeps the nav landmark + button labels.

**Steps:** 1) RED #4 (floating 32px, uppercase). 2) Sticky `top:136px`; 40px rail;
sentence-case title. 3) Live-verify anchor + collapse in light + dark; cursor-move →
active row tracks. 4) Update #4 baselines (open + collapsed).

---

### L5 — Page canvas fits better

**Files:** `Editor.tsx:1500-1552` (canvas wrapper `canvasWrapRef` 1518, scaled host
1530-1537); `PageCanvas.tsx:79-150`; `globals.css:724-732` (`.parchment-page`),
`:390-395` (`.parchment-editor-shell` gutter), `:3526-3540` (mobile `--page-scale`).

**Current → Target:**
- Current: the page is a fixed ~816px `.parchment-page` (bg `--page-bg`, border, box-
  shadow `--shadow-page` — **S1-3 shadow confirmed present at `:729`**), inside a
  `flex:1` wrapper that grows to fill, so gutter (`--editor-gutter` on the shell) shows
  only when the viewport exceeds page+gutter. No explicit gutter-only horizontal scroll;
  mobile scales via `--page-scale`.
- Target: editor viewport = window − global sidebar − outline pane; the page **centered**
  in a `--editor-gutter` (light #F1F3F4 / dark #202124) gutter; page width 816px @100%
  (zoom/page-setup configurable); **page max-width never exceeds the viewport** — when
  zoom×width > viewport, **horizontal scroll on the gutter container only** (not the
  toolbar/footer); **≥24px vertical pad** above/below; the `--shadow-page` preserved.

**Change:** **restyle** — center the page in the canvas wrapper (`margin:0 auto` /
`justify-content:center`), put `overflow-x:auto` on the **gutter container only**, add
24px vertical padding, keep the page width fixed (not %). Confirm `--shadow-page`
survives. No editor/handler changes.

**Accept:** the page is centered in its gutter; widening/narrowing the viewport keeps
gutters on both sides and never hides the page under chrome; at high zoom only the
gutter scrolls horizontally (chrome stays put); 24px top/bottom pad; the page shadow
remains. **Proves it:** surface **#1 (editor idle)** baseline (light + dark) shows the
centered page + gutter; a zoom/narrow check shows gutter-only h-scroll.

**Steps:** 1) RED #1. 2) Center page + gutter-only `overflow-x` + 24px pad; verify
shadow. 3) Live-verify at wide/narrow/zoomed widths in light + dark. 4) Update #1.

---

### L6 — Eliminate floating-card chrome

**Files:** `Editor.tsx:1413-1418` (the `max-w-5xl` column); `globals.css:390-395`
(shell gutter).

**Current → Target:**
- Current (grounded): there is **no rounded-card class** — the `max-w-5xl` column is a
  flat flex column on the `--editor-gutter` shell. The "card" impression is purely the
  `max-w-5xl` centering clamp (which L1/L2/L3 dissolve) + the white sheet on grey.
- Target: no nested rounded card; chrome full-width (L1/L2), outline left-anchored (L4),
  page centered in gutter (L5). This item is mostly a **verify** that no card residue
  (border-radius / box-shadow / border on the column or its children) remains after the
  L1/L2/L4/L5 reshape.

**Change:** **restyle/verify** — grep for and remove any `border-radius`/`box-shadow`/
`border` on the column wrapper or its immediate children (the page keeps `--shadow-page`;
that is intentional, not the "card"). After L1–L5, confirm the layout is flat.

**Accept:** no rounded card framing the chrome; only the **page** carries
`--shadow-page`; gutter is `--editor-gutter`. **Proves it:** surface **#1** baseline
(light + dark) post-L1–L5; grep confirms no stray card styling on the column.

**Steps:** 1) After L1–L5, grep the column + children for radius/shadow/border. 2)
Remove any residue (preserve the page shadow). 3) Update #1 baseline.

---

### L7 — Sticky top chrome stack ordering (136px) + pinned status bar

**Files:** `Editor.tsx:1413-1484`; `globals.css:406-1033` (the three bar blocks).

**Current → Target:**
- Current: title (56px) / menu (32px) / toolbar (48px) = 136px, in normal flow, **not
  sticky**, no z-index.
- Target: a sticky top stack — title `sticky; top:0; z-30`, menu `top:56px; z-20`,
  toolbar `top:88px; z-10` (so they stack flush = 136px and the title wins on overlap);
  the **outline + canvas start at `top:136px`** (L4 outline uses `top:136px`); the
  **status bar pinned `bottom:0`** (F8/L3); document content scrolls between.

**Change:** **CSS positioning only** — add `position:sticky` + the `top`/`z-index`
values to the three bars; coordinate with L4's `top:136px` outline and F8/L3's pinned
footer. No handlers.

**Accept:** scrolling a long doc keeps the 136px chrome stack pinned (correct overlap
order) and the 24px status bar pinned at the bottom; the outline sticks below the
chrome; canvas content scrolls between without being hidden. **Proves it:** surface
**#1 (editor idle)** + a scrolled capture (light + dark) show the pinned stack +
footer; no content hidden under the chrome.

**Steps:** 1) RED #1 (non-sticky chrome). 2) Add sticky+z-index to the three bars;
align outline `top:136px` + footer `bottom:0`. 3) Live-verify scroll + overlap order in
light + dark. 4) Update #1 baseline + a scrolled artifact.

---

## Coverage check
- **One structural change, seven facets:** L1/L2/L3 = full-bleed-bg/centered-content on
  the three chrome rows + footer (lift out of `max-w-5xl`, centered inner); L4 = anchor
  + sticky the outline, 40px rail, sentence-case title; L5 = center the page in a
  gutter-only-scroll gutter with 24px pad, preserve `--shadow-page`; L6 = verify no
  card residue; L7 = the sticky `top` / z-index stack tying it together. **F8 is the
  status-bar pin — execute F8+L3 in one PR.**
- **Everything is already wired** (grounding confirmed every chrome component has its
  full prop set + handlers). L touches **zero** handlers/endpoints — pure CSS + the
  wrapper-restructure to split bg from content.
- **Tokens:** gutter `--editor-gutter`, chrome bg `--surface`, borders `--border-chrome`,
  outline `--surface-muted`, page shadow `--shadow-page` (all minted in v0.1.1 S1) — no
  literals.
- **Out of scope:** zoom/page-setup logic (exists — L5 only respects the configured
  width); the mobile `--page-scale` path (S2-6 responsive, v0.1.1) — L stacks at desktop
  width and must not regress the narrow path.

## Newly-discovered gaps / scoping flags
- **No rounded "card" exists in code (L6):** the float is the `max-w-5xl` clamp, not a
  card class. L6 is largely a post-L1–L5 verify, not a deletion of a real card.
- **Status bar already rendered (F8/L3):** the work is pinning, not restoring.
- **Sticky stack vs the page shadow:** the page keeps `--shadow-page` (S1-3) — do not
  strip it while removing "card" framing (L6); the shadow is the page, not the card.
- **Sticky chrome + the S2-6 responsive path:** at <768px the v0.1.1 responsive chrome
  takes over; L's sticky values must not break the narrow reflow — verify both widths.

## Failure-modes-verified
- **Bg clamped, not full-bleed (L1/L2/L3):** confirm the bar's **parent** is no longer
  `max-w-5xl` — the bg must bleed to the viewport edge while an inner `mx-auto` holds
  content; a snapshot at >1024px viewport shows no dark side-gutter on the bars.
- **Sticky overlap / z-index collision (L7):** title z-30 > menu z-20 > toolbar z-10;
  scroll a long doc and confirm the bars don't bleed through each other and content
  isn't hidden under the 136px stack (reserve top offset; outline `top:136px`).
- **Outline overlaps canvas (L4):** the anchored sticky pane must sit beside the page,
  not over it; the active heading row still tracks the cursor (G7/G8 lessons intact);
  the 40px collapsed rail keeps a usable re-open affordance.
- **Page hidden / no gutter scroll (L5):** at high zoom only the gutter container scrolls
  horizontally — the toolbar/footer stay put; the page never hides behind the sidebar or
  chrome; `--shadow-page` present; 24px vertical pad.
- **Card residue (L6):** grep the column + children for `border-radius`/`box-shadow`/
  `border`; only `.parchment-page` keeps a shadow.
- **Status bar clips content (F8/L3):** pinned footer reserves `padding-bottom`; a long
  doc's last line is fully visible; word-count modal still opens.
- **Light AND dark (all L):** every layout surface captured + (where relevant) axe-clean
  in BOTH schemes; the gutter is `--editor-gutter` (#F1F3F4 / #202124), never a literal.
- **Narrow-viewport regression:** verify the S2-6 responsive chrome still works under
  the new sticky values (sidebar drawer + chrome reflow at <768px).
