/**
 * G14 — Smart paste: content-type sniffer + HTML normalizers.
 *
 * This module is PURE — no DOMParser calls at module load, no editor-graph
 * imports. DOMParser is only called inside normalizePastedHtml() which runs in
 * the browser (guarded by typeof DOMParser !== 'undefined'). This keeps
 * getSchema(baseExtensions) buildable in the Next.js server runtime.
 */

export type PasteSource = 'word' | 'gdocs' | 'notion' | 'web' | 'markdown' | 'plain'

/**
 * Sniff the source of clipboard content from the HTML and plain text.
 * Priority order: word > gdocs > notion > markdown (plain text only) > web > plain.
 */
export function sniffPasteSource(html: string, text: string): PasteSource {
  if (/<w:|mso-|class=.?Mso|<o:p|urn:schemas-microsoft/i.test(html)) return 'word'
  if (/docs-internal-guid-|id=.?docs-internal/i.test(html)) return 'gdocs'
  if (/notion\.so|data-block-id|class=.?notion-/i.test(html)) return 'notion'
  // ProseMirror's own clipboard HTML contains data-pm-slice on the first element.
  // Treat it as 'plain' so we never mangle internal copy-paste or strip textStyle marks.
  if (/data-pm-slice=/.test(html)) return 'plain'
  // Markdown: plain text only (no HTML) that looks like markdown
  if ((!html || html.trim().length === 0) && looksLikeMarkdown(text)) return 'markdown'
  // If HTML is present but no foreign markers → generic web
  if (html && html.trim().length > 0) return 'web'
  return 'plain'
}

/**
 * Returns true when plain text looks like markdown:
 * headings, lists, bold (**), inline code (`), fenced code blocks, or links.
 */
export function looksLikeMarkdown(text: string): boolean {
  if (!text || text.trim().length === 0) return false
  const lines = text.split('\n')
  return lines.some((line) => {
    const t = line.trimStart()
    // ATX headings
    if (/^#{1,6}\s/.test(t)) return true
    // Unordered list items
    if (/^[-*+]\s/.test(t)) return true
    // Ordered list items
    if (/^\d+\.\s/.test(t)) return true
    // Blockquotes
    if (/^>\s/.test(t)) return true
    // Fenced code blocks
    if (/^```/.test(t)) return true
    // Inline bold/italic/code/link patterns (anywhere in line)
    if (/\*\*\S/.test(line) || /`[^`]/.test(line) || /\[.+\]\(https?:/.test(line)) return true
    return false
  })
}

/**
 * Normalize foreign HTML for the given source into clean HTML.
 * Uses DOMParser in the browser (guarded); falls back to regex in non-DOM env.
 * NEVER throws — on any failure returns the original html.
 */
export function normalizePastedHtml(html: string, source: PasteSource): string {
  if (source === 'plain' || source === 'markdown') return html
  try {
    if (typeof DOMParser !== 'undefined') {
      return normalizeDom(html, source)
    }
    // Non-DOM fallback: conservative regex strip
    return normalizeRegex(html, source)
  } catch {
    return html
  }
}

// ── DOM-based normalizer (browser only) ─────────────────────────────────────

function normalizeDom(html: string, source: PasteSource): string {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')

  // Remove globally unwanted elements
  for (const tag of ['script', 'style', 'meta', 'link', 'noscript', 'iframe']) {
    for (const el of Array.from(doc.querySelectorAll(tag))) {
      el.remove()
    }
  }

  // Remove HTML comments
  removeComments(doc.body)

  // Source-specific structural cleanup (unwrap wrappers, convert Word lists, …).
  if (source === 'word') {
    normalizeWord(doc)
  } else if (source === 'gdocs') {
    normalizeGdocs(doc)
  } else if (source === 'notion') {
    normalizeNotion(doc)
  }
  // web needs no source-specific structural pass — the shared cleanup covers it.

  // Shared v0.2.10 cleanup for every foreign source. Order matters:
  //  1. map inline styling (font-weight/style/text-decoration) → real marks
  //     BEFORE we strip style attrs, so we never lose bold/italic/underline;
  //  2. drop purely-visual styling (color / background / font-family / highlight)
  //     — Parchment's model is clean semantic content, so these are discarded;
  //  3. strip junk attributes (class / lang / dir / style / on* / tracking);
  //  4. unwrap now-attribute-less <span>/<font> soup;
  //  5. collapse runs of >1 consecutive empty paragraphs to a single one.
  mapInlineStylesToSemantics(doc)
  dropVisualStyles(doc.body)
  stripJunkAttrs(doc.body)
  unwrapStylingSpans(doc.body)
  collapseEmptyParagraphs(doc.body)

  return doc.body.innerHTML
}

// ── Shared v0.2.10 cleanup helpers (DOM) ────────────────────────────────────

/**
 * Style declarations we consider purely visual and therefore DROP everywhere
 * (Parchment keeps semantic content, not styled soup). Highlight = background.
 */
const VISUAL_STYLE_PROP =
  /^(color|background|background-color|font-family|font|mso-[a-z-]*|line-height|letter-spacing|font-size|text-indent|margin[a-z-]*|padding[a-z-]*|width|height|tab-stops|text-transform|vertical-align|white-space)$/i

/** Parse a `style` string into [prop, value] pairs (lowercased prop). */
function parseStyle(style: string): Array<[string, string]> {
  return style
    .split(';')
    .map((decl) => decl.trim())
    .filter((decl) => decl.length > 0)
    .map((decl) => {
      const idx = decl.indexOf(':')
      if (idx === -1) return ['', ''] as [string, string]
      return [decl.slice(0, idx).trim().toLowerCase(), decl.slice(idx + 1).trim()] as [
        string,
        string,
      ]
    })
    .filter(([prop]) => prop.length > 0)
}

/** True when a style string marks bold text (font-weight bold or >= 600). */
function styleIsBold(style: string): boolean {
  for (const [prop, value] of parseStyle(style)) {
    if (prop !== 'font-weight') continue
    if (/bold|bolder/i.test(value)) return true
    const n = Number.parseInt(value, 10)
    if (Number.isFinite(n) && n >= 600) return true
  }
  return false
}

function styleIsItalic(style: string): boolean {
  return parseStyle(style).some(
    ([prop, value]) => prop === 'font-style' && /italic|oblique/i.test(value),
  )
}

function styleIsUnderline(style: string): boolean {
  return parseStyle(style).some(
    ([prop, value]) => prop === 'text-decoration' && /underline/i.test(value),
  )
}

function styleIsStrike(style: string): boolean {
  return parseStyle(style).some(
    ([prop, value]) => prop === 'text-decoration' && /line-through/i.test(value),
  )
}

/**
 * Wrap the children of `el` in the requested semantic mark elements, innermost
 * last, then replace `el` with the wrapped fragment. Preserves child order.
 */
function wrapChildrenInMarks(el: Element, marks: Array<'strong' | 'em' | 'u' | 's'>): void {
  const doc = el.ownerDocument ?? document
  const children = Array.from(el.childNodes)
  // Build from the outside in: strong( em( u( children ) ) )
  let inner: Node[] = children
  for (let i = marks.length - 1; i >= 0; i--) {
    const wrapper = doc.createElement(marks[i] as string)
    wrapper.append(...inner)
    inner = [wrapper]
  }
  el.replaceWith(...inner)
}

/**
 * For every element carrying a `style` that encodes bold/italic/underline/strike,
 * emit the corresponding semantic tag(s) around its content. Runs for spans and
 * any inline element. This is what lets style-only Word/GDocs/web formatting come
 * through as real marks before we strip the style attribute.
 */
function mapInlineStylesToSemantics(doc: Document): void {
  // Snapshot first — we mutate the tree as we go.
  for (const el of Array.from(doc.body.querySelectorAll('[style]'))) {
    // Never touch structural/media nodes; only inline-content carriers.
    const tag = el.tagName.toUpperCase()
    if (tag === 'IMG' || tag === 'TABLE' || tag === 'PRE' || tag === 'CODE') continue
    const style = el.getAttribute('style') ?? ''
    const marks: Array<'strong' | 'em' | 'u' | 's'> = []
    if (styleIsBold(style)) marks.push('strong')
    if (styleIsItalic(style)) marks.push('em')
    if (styleIsUnderline(style)) marks.push('u')
    if (styleIsStrike(style)) marks.push('s')
    if (marks.length === 0) continue
    // Only remap SPAN/FONT wrappers into pure marks; for block/other elements we
    // keep the element and let dropVisualStyles clear the style (a styled <p> is
    // still a <p>). Wrapping a <p> in <strong> would be invalid block nesting.
    if (tag === 'SPAN' || tag === 'FONT') {
      wrapChildrenInMarks(el, marks)
    }
  }
}

/** Drop purely-visual style declarations; remove the attr if nothing remains. */
function dropVisualStyles(root: HTMLElement): void {
  // Unwrap <mark> (highlight) — keep the text, drop the highlight.
  for (const el of Array.from(root.querySelectorAll('mark'))) {
    el.replaceWith(...Array.from(el.childNodes))
  }
  for (const el of Array.from(root.querySelectorAll('[style]'))) {
    const style = el.getAttribute('style') ?? ''
    const kept = parseStyle(style)
      .filter(([prop]) => !VISUAL_STYLE_PROP.test(prop))
      .map(([prop, value]) => `${prop}: ${value}`)
    if (kept.length > 0) {
      el.setAttribute('style', kept.join('; '))
    } else {
      el.removeAttribute('style')
    }
  }
}

/** Strip class / lang / dir / style / on* / tracking / align attributes. */
function stripJunkAttrs(root: HTMLElement): void {
  for (const el of Array.from(root.querySelectorAll('*'))) {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase()
      if (
        name === 'class' ||
        name === 'lang' ||
        name === 'dir' ||
        name === 'style' ||
        name === 'align' ||
        name === 'data-tracking' ||
        name.startsWith('on')
      ) {
        el.removeAttribute(attr.name)
      }
    }
  }
}

/** Unwrap <span>/<font> that carry no attributes (styling-only soup). */
function unwrapStylingSpans(root: HTMLElement): void {
  // Repeat until stable — nested spans unwrap outer-to-inner across passes.
  let changed = true
  let guard = 0
  while (changed && guard < 10) {
    changed = false
    guard++
    for (const el of Array.from(root.querySelectorAll('span, font'))) {
      if (!el.hasAttributes()) {
        el.replaceWith(...Array.from(el.childNodes))
        changed = true
      }
    }
  }
}

/** An empty paragraph carries no text and no media (img/br do not count as content). */
function isEmptyParagraph(el: Element): boolean {
  if (el.tagName.toUpperCase() !== 'P') return false
  if (el.querySelector('img, table, hr, pre, code, a[href]')) return false
  // \u00a0 = &nbsp; — Word pads empty paragraphs with it.
  const text = (el.textContent ?? '').replace(/\u00a0/g, ' ').trim()
  return text.length === 0
}

/** Collapse runs of >1 consecutive empty <p> to a single empty <p>. */
function collapseEmptyParagraphs(root: HTMLElement): void {
  let prevEmpty = false
  for (const child of Array.from(root.children)) {
    const empty = isEmptyParagraph(child)
    if (empty && prevEmpty) {
      child.remove()
      continue
    }
    prevEmpty = empty
  }
}

function removeComments(node: Node): void {
  const toRemove: Node[] = []
  // CRITICAL: use the node's OWN document, not the global `document`. `node` belongs
  // to the DOMParser document; a real browser throws WrongDocumentError when the
  // global document's createTreeWalker is rooted at a node from another document
  // (jsdom tolerates it, which is why unit tests passed but live paste did not strip).
  const ownerDoc = (node.nodeType === 9 ? (node as Document) : node.ownerDocument) ?? document
  const walker = ownerDoc.createTreeWalker(node, NodeFilter.SHOW_COMMENT)
  let current = walker.nextNode()
  while (current) {
    toRemove.push(current)
    current = walker.nextNode()
  }
  for (const n of toRemove) {
    n.parentNode?.removeChild(n)
  }
}

function normalizeWord(doc: Document): void {
  // Remove Word-specific elements: <o:p>, <xml>, <v:*> (VML). Conditional
  // comments were already stripped as HTML comments.
  for (const el of Array.from(doc.querySelectorAll('o\\:p, xml, v\\:shapetype, v\\:shape'))) {
    el.replaceWith((el.ownerDocument ?? document).createTextNode(el.textContent ?? ''))
  }
  // Map Word heading paragraphs (MsoHeadingN / MsoTitle classes and
  // mso-outline-level styles) to real <hN> BEFORE classes/styles are stripped.
  mapWordHeadings(doc)
  // Convert consecutive MsoListParagraph* / mso-list paragraphs into real lists.
  // Marker glyph spans (mso-list:Ignore) are read for ol/ul detection INSIDE the
  // conversion, then removed there.
  convertWordLists(doc)
  // Sweep any leftover marker spans outside converted runs so the literal
  // "1." / "·" glyphs never leak into paragraph text.
  for (const span of Array.from(doc.body.querySelectorAll('span[style]'))) {
    if (/mso-list\s*:\s*ignore/i.test(span.getAttribute('style') ?? '')) {
      span.remove()
    }
  }
}

/**
 * Map Word heading paragraphs to real headings BEFORE attribute stripping:
 *   <p class="MsoHeadingN">   → <hN>  (N clamped to 1..6)
 *   <p class="MsoTitle">      → <h1>
 *   <p style="mso-outline-level:N"> → <hN>
 * Real <h1..6> tags from Word pass through as themselves. List paragraphs are
 * never remapped even when they carry an outline level.
 */
function mapWordHeadings(doc: Document): void {
  for (const p of Array.from(doc.body.querySelectorAll('p'))) {
    const cls = p.getAttribute('class') ?? ''
    const style = p.getAttribute('style') ?? ''
    if (/MsoListParagraph/i.test(cls) || /mso-list\s*:/i.test(style)) continue
    let level = 0
    const mClass = /\bMsoHeading(\d)/i.exec(cls)
    const mOutline = /mso-outline-level\s*:\s*(\d)/i.exec(style)
    if (mClass) level = Number.parseInt(mClass[1] as string, 10)
    else if (/\bMsoTitle\b/i.test(cls)) level = 1
    else if (mOutline) level = Number.parseInt(mOutline[1] as string, 10)
    if (level < 1) continue
    const h = doc.createElement(`h${Math.min(6, level)}`)
    h.append(...Array.from(p.childNodes))
    p.replaceWith(h)
  }
}

/**
 * Group runs of Word list paragraphs into real <ol>/<ul>. Word emits each list
 * item as a <p class="MsoListParagraph…" style="mso-list:lN levelM lfoK">. We:
 *  - detect a list paragraph by the class or the `mso-list:` style;
 *  - read the nesting level from `levelM` (best-effort);
 *  - pick <ol> vs <ul> from the first item's leading glyph (digit/letter → ol);
 *  - emit nested lists when the level increases.
 *
 * FIDELITY NOTE: flat single-level lists come through faithfully. Nesting is
 * best-effort — deeper levels are nested under the last item of the parent
 * level; mixed ordered/unordered nesting picks the type per sub-list from its
 * own first glyph. This is honest best-effort, not pixel-perfect Word fidelity.
 */
function convertWordLists(doc: Document): void {
  const isListPara = (el: Element): boolean => {
    if (el.tagName.toUpperCase() !== 'P') return false
    const cls = el.getAttribute('class') ?? ''
    if (/MsoListParagraph/i.test(cls)) return true
    return /mso-list\s*:/i.test(el.getAttribute('style') ?? '')
  }
  const levelOf = (el: Element): number => {
    const m = /mso-list\s*:[^;"]*\blevel(\d+)/i.exec(el.getAttribute('style') ?? '')
    return m ? Math.max(1, Number.parseInt(m[1] as string, 10)) : 1
  }
  const findMarkerSpans = (el: Element): Element[] =>
    Array.from(el.querySelectorAll('span[style]')).filter((span) =>
      /mso-list\s*:\s*ignore/i.test(span.getAttribute('style') ?? ''),
    )
  // An ordered marker is a digit / letter / roman numeral followed by "." or ")".
  // Bullet glyphs (· o § • ‑) have no such suffix. Read the marker SPAN (still in
  // the DOM at this point); fall back to the leading text when absent.
  const isOrdered = (el: Element): boolean => {
    const markerSpan = findMarkerSpans(el)[0]
    const marker = (markerSpan?.textContent ?? '').trim()
    if (marker.length > 0) return /^(\d+|[a-zA-Z]|[ivxlcdmIVXLCDM]+)[.)]/.test(marker)
    const t = (el.textContent ?? '').trimStart()
    return /^(\d+|[a-zA-Z])[.)]/.test(t)
  }

  const children = Array.from(doc.body.children)
  let i = 0
  while (i < children.length) {
    const start = children[i] as Element
    if (!isListPara(start)) {
      i++
      continue
    }
    // Collect the maximal run of consecutive list paragraphs.
    const run: Element[] = []
    let j = i
    while (j < children.length && isListPara(children[j] as Element)) {
      run.push(children[j] as Element)
      j++
    }

    // Build nested lists from the run using a level stack.
    const rootList = doc.createElement(isOrdered(run[0] as Element) ? 'ol' : 'ul')
    // stack[k] = { list, level, lastLi }
    const stack: Array<{ list: HTMLElement; level: number; lastLi: HTMLElement | null }> = [
      { list: rootList, level: levelOf(run[0] as Element), lastLi: null },
    ]
    for (const p of run) {
      const level = levelOf(p)
      // Ascend to the correct level.
      while (stack.length > 1 && level < (stack[stack.length - 1] as { level: number }).level) {
        stack.pop()
      }
      let top = stack[stack.length - 1] as {
        list: HTMLElement
        level: number
        lastLi: HTMLElement | null
      }
      // Descend: open a new nested list under the previous <li>.
      if (level > top.level && top.lastLi) {
        const sub = doc.createElement(isOrdered(p) ? 'ol' : 'ul')
        top.lastLi.appendChild(sub)
        stack.push({ list: sub, level, lastLi: null })
        top = stack[stack.length - 1] as typeof top
      }
      const li = doc.createElement('li')
      // Drop the marker span(s) NOW — after isOrdered has read the glyph — then
      // move the paragraph's remaining inline content into the <li>.
      for (const span of findMarkerSpans(p)) span.remove()
      li.append(...Array.from(p.childNodes))
      trimLeadingWhitespace(li)
      top.list.appendChild(li)
      top.lastLi = li
    }
    // Replace the first list paragraph with the assembled list; remove the rest.
    ;(run[0] as Element).replaceWith(rootList)
    for (let k = 1; k < run.length; k++) (run[k] as Element).remove()

    // children snapshot is now stale for the replaced region; re-fetch and continue.
    const refreshed = Array.from(doc.body.children)
    children.length = 0
    children.push(...refreshed)
    i = refreshed.indexOf(rootList) + 1
  }
}

/** Remove leading whitespace-only text nodes from an element. */
function trimLeadingWhitespace(el: Element): void {
  while (
    el.firstChild &&
    el.firstChild.nodeType === 3 &&
    (el.firstChild.textContent ?? '').trim() === ''
  ) {
    el.removeChild(el.firstChild)
  }
  // Also left-trim the first text node if it starts with the NBSP/space gap.
  if (el.firstChild && el.firstChild.nodeType === 3) {
    el.firstChild.textContent = (el.firstChild.textContent ?? '').replace(/^[\s ]+/, '')
  }
}

function normalizeGdocs(doc: Document): void {
  // GDocs wraps everything in <b id="docs-internal-guid-..."> — unwrap it.
  // (The style→semantics mapping is handled by the shared mapInlineStylesToSemantics
  // pass in normalizeDom, which also covers font-weight>=600, not just 700/bold.)
  for (const el of Array.from(doc.querySelectorAll('b[id^="docs-internal-guid"]'))) {
    el.replaceWith(...Array.from(el.childNodes))
  }
}

function normalizeNotion(doc: Document): void {
  // Strip Notion-specific data-* attributes (data-block-id, …). The shared pass
  // handles class/style/lang/dir; here we only remove the data-* soup that the
  // shared pass leaves alone (data-* can be meaningful elsewhere, e.g. tables).
  for (const el of Array.from(doc.body.querySelectorAll('*'))) {
    for (const attr of Array.from(el.attributes)) {
      if (attr.name.startsWith('data-')) {
        el.removeAttribute(attr.name)
      }
    }
  }
}

// ── Regex fallback (non-DOM env) ─────────────────────────────────────────────

function normalizeRegex(html: string, source: PasteSource): string {
  let out = html
  // Remove script/style/noscript/iframe blocks
  out = out.replace(/<(script|style|noscript|iframe)[^>]*>[\s\S]*?<\/\1>/gi, '')
  // Remove HTML comments
  out = out.replace(/<!--[\s\S]*?-->/g, '')
  // Remove <o:p> and <xml> tags
  out = out.replace(/<o:p[^>]*>[\s\S]*?<\/o:p>/gi, '')
  out = out.replace(/<xml[^>]*>[\s\S]*?<\/xml>/gi, '')
  // Remove on* event attrs
  out = out.replace(/\s+on\w+="[^"]*"/gi, '')
  out = out.replace(/\s+on\w+='[^']*'/gi, '')

  if (source === 'word') {
    // Strip mso- style declarations
    out = out.replace(/\s*mso-[^;}"']+[;]?/gi, '')
    // Strip Mso class attributes
    out = out.replace(/\s*class="[^"]*Mso[^"]*"/gi, '')
  }

  if (source === 'gdocs') {
    // Unwrap docs-internal-guid b tag
    out = out.replace(/<b\s+id="docs-internal-guid-[^"]*"[^>]*>([\s\S]*?)<\/b>/gi, '$1')
    // Map font-weight:bold/700 spans to strong
    out = out.replace(
      /<span[^>]*style="[^"]*font-weight\s*:\s*(?:700|bold)[^"]*"[^>]*>([\s\S]*?)<\/span>/gi,
      '<strong>$1</strong>',
    )
  }

  return out
}
