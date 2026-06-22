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

  // Source-specific cleanup
  if (source === 'word') {
    normalizeWord(doc)
  } else if (source === 'gdocs') {
    normalizeGdocs(doc)
  } else if (source === 'notion') {
    normalizeNotion(doc)
  } else {
    // web
    normalizeWeb(doc)
  }

  return doc.body.innerHTML
}

function removeComments(node: Node): void {
  const toRemove: Node[] = []
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_COMMENT)
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
  // Remove Word-specific elements: <o:p>, <xml>, conditional comments already stripped
  for (const el of Array.from(doc.querySelectorAll('o\\:p, xml'))) {
    // Replace with its text content to not lose inline text
    el.replaceWith(document.createTextNode(el.textContent ?? ''))
  }

  // Walk all elements and strip mso-*/Mso styles and class attributes
  for (const el of Array.from(doc.body.querySelectorAll('*'))) {
    // Strip class attributes matching Mso*
    const cls = el.getAttribute('class')
    if (cls && /\bMso\w*/i.test(cls)) {
      el.removeAttribute('class')
    }

    // Strip inline styles containing mso- properties, preserving non-mso ones
    const style = el.getAttribute('style')
    if (style) {
      const cleaned = style
        .split(';')
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && !/^mso-/i.test(s))
        .join('; ')
      if (cleaned.length > 0) {
        el.setAttribute('style', cleaned)
      } else {
        el.removeAttribute('style')
      }
    }

    // Remove tracking/event attributes
    for (const attr of Array.from(el.attributes)) {
      if (/^on/i.test(attr.name) || attr.name === 'data-tracking') {
        el.removeAttribute(attr.name)
      }
    }

    // Unwrap empty spans that add nothing
    if (el.tagName === 'SPAN' && !el.hasAttributes() && el.childNodes.length > 0) {
      el.replaceWith(...Array.from(el.childNodes))
    }
  }
}

function normalizeGdocs(doc: Document): void {
  // GDocs wraps everything in <b id="docs-internal-guid-..."> — unwrap it
  for (const el of Array.from(doc.querySelectorAll('b[id^="docs-internal-guid"]'))) {
    el.replaceWith(...Array.from(el.childNodes))
  }

  // Map inline styles: font-weight:700/bold → <strong>, font-style:italic → <em>
  for (const el of Array.from(doc.body.querySelectorAll('span[style]'))) {
    const style = el.getAttribute('style') ?? ''
    const isBold = /font-weight\s*:\s*(700|bold)/i.test(style)
    const isItalic = /font-style\s*:\s*italic/i.test(style)

    if (isBold && isItalic) {
      const strong = doc.createElement('strong')
      const em = doc.createElement('em')
      em.append(...Array.from(el.childNodes))
      strong.appendChild(em)
      el.replaceWith(strong)
    } else if (isBold) {
      const strong = doc.createElement('strong')
      strong.append(...Array.from(el.childNodes))
      el.replaceWith(strong)
    } else if (isItalic) {
      const em = doc.createElement('em')
      em.append(...Array.from(el.childNodes))
      el.replaceWith(em)
    } else {
      // Not bold or italic — strip the span wrapper (keep children)
      el.replaceWith(...Array.from(el.childNodes))
    }
  }

  // Strip all remaining style and event attrs
  stripAttrs(doc.body)
}

function normalizeNotion(doc: Document): void {
  // Strip data-* attributes (data-block-id, data-content-editable-leaf, etc.)
  for (const el of Array.from(doc.body.querySelectorAll('*'))) {
    for (const attr of Array.from(el.attributes)) {
      if (attr.name.startsWith('data-') || /^on/i.test(attr.name)) {
        el.removeAttribute(attr.name)
      }
    }
    // Remove notion-* class attributes
    const cls = el.getAttribute('class')
    if (cls && /notion/i.test(cls)) {
      el.removeAttribute('class')
    }
    // Remove style from wrapper divs (keep structure)
    if (el.tagName === 'DIV') {
      el.removeAttribute('style')
    }
  }
}

function normalizeWeb(doc: Document): void {
  // Strip tracking/event/style attributes, keep semantic content
  stripAttrs(doc.body)
}

function stripAttrs(root: HTMLElement): void {
  for (const el of Array.from(root.querySelectorAll('*'))) {
    for (const attr of Array.from(el.attributes)) {
      if (/^on/i.test(attr.name) || attr.name === 'data-tracking' || attr.name === 'style') {
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
