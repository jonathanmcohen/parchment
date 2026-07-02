// @vitest-environment jsdom
/**
 * v0.2.10 — Paste-from-Word/HTML cleanup tests.
 *
 * Extends the G14 smart-paste normalizer with the fuller v0.2.10 spec:
 *  - DROP font colors / background / font-family / highlight everywhere.
 *  - MAP style-based bold (font-weight>=600) / italic / underline → semantics
 *    for the web path too (not just GDocs).
 *  - Word MsoListParagraph + mso-list → real lists (flat fidelity guaranteed).
 *  - Collapse runs of >1 consecutive empty paragraphs to 1.
 *  - Strip lang / dir / class / style-soup on spans.
 *  - Preserve tables (colspan/rowspan), images (src http + data:), <pre>/<code>.
 *  - NEVER degrade internal ProseMirror clipboard HTML (data-pm-slice).
 *
 * Uses jsdom so DOMParser is available for normalizePastedHtml (the DOM path,
 * which is what runs live in the browser).
 */
import { describe, expect, it } from 'vitest'
import { normalizePastedHtml, sniffPasteSource } from '@/lib/editor/smart-paste'

// ── REAL fixtures ─────────────────────────────────────────────────────────────

// A Word-generated fragment: mso classes/styles, MsoListParagraph list, nested
// spans, font colors, o:p, lang/dir. This is representative of what Word/Outlook
// place on the clipboard as text/html.
const WORD_FRAGMENT = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head><meta charset="utf-8"><link rel="stylesheet" href="x.css"></head>
<body lang="EN-US" style="tab-interval:.5in">
<!--StartFragment-->
<h1 class="MsoHeading1" style="mso-style-name:heading1;color:#1F497D;font-family:Calibri Light">Quarterly Report</h1>
<p class="MsoNormal" style="margin:0;font-size:11pt;color:#000000" lang="EN-US">
  Intro with <b style="mso-bidi-font-weight:normal">bold</b> and
  <span style="font-style:italic;color:red">italic red</span> and
  <span style="font-weight:600;font-family:Arial">semibold</span> text.
</p>
<p class="MsoNormal" style="mso-margin-top-alt:auto"><o:p>&nbsp;</o:p></p>
<p class="MsoNormal"><o:p></o:p></p>
<p class="MsoListParagraphCxSpFirst" style="margin-left:.5in;mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">1.<span style="font:7pt 'Times New Roman'">&nbsp;&nbsp;</span></span>First item</p>
<p class="MsoListParagraphCxSpMiddle" style="margin-left:.5in;mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">2.<span style="font:7pt 'Times New Roman'">&nbsp;&nbsp;</span></span>Second item</p>
<p class="MsoListParagraphCxSpLast" style="margin-left:.5in;mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">3.<span style="font:7pt 'Times New Roman'">&nbsp;&nbsp;</span></span>Third item</p>
<!--EndFragment-->
</body></html>`

// A Google-Docs fragment: b/i via inline styles + span-style soup, colors,
// wrapped in the docs-internal-guid <b>.
const GDOCS_FRAGMENT = `<meta charset="utf-8"><b id="docs-internal-guid-abc" style="font-weight:normal">
<h2 dir="ltr" style="line-height:1.38;color:#111"><span style="font-size:16pt;color:#0b57d0;font-family:Arial">Section Title</span></h2>
<p dir="ltr" style="line-height:1.38"><span style="font-weight:700;color:#c00">bold red</span><span style="color:#000"> then </span><span style="font-style:italic;background-color:#ff0">italic hl</span><span style="font-weight:600"> semibold six-hundred</span></p>
</b>`

// A generic webpage fragment: nav junk, hrefs, images (http + data:), a table
// with colspan, a code sample, class soup, inline-style bold/italic/underline.
const WEB_FRAGMENT = `<html><body>
<nav class="site-nav"><a href="https://example.com/home" class="nav-link" onclick="track('home')">Home</a></nav>
<h2 class="post-title" style="color:#333;font-family:Georgia">Article</h2>
<p class="lead" style="color:#555">Lead with <span style="font-weight:700">bold</span>, <span style="font-style:italic">italic</span>, and <span style="text-decoration:underline">under</span>.</p>
<p><a href="https://example.com/post?utm_source=x">a link</a></p>
<img src="https://example.com/pic.png" alt="pic" width="100">
<img src="data:image/png;base64,iVBORw0KGgoAAAANS" alt="inline">
<pre><code class="language-js">const x = 1;
console.log(x);</code></pre>
<table><tbody>
<tr><th colspan="2">Header spans two</th></tr>
<tr><td>A1</td><td rowspan="2">B spans two rows</td></tr>
<tr><td>A2</td></tr>
</tbody></table>
<script>steal()</script>
</body></html>`

// ── Word path ─────────────────────────────────────────────────────────────────

describe('normalizePastedHtml — Word (v0.2.10 spec)', () => {
  const out = () => normalizePastedHtml(WORD_FRAGMENT, 'word')

  it('drops font color styles', () => {
    expect(out()).not.toMatch(/color\s*:/i)
  })

  it('drops font-family styles', () => {
    expect(out()).not.toMatch(/font-family/i)
  })

  it('strips lang and dir attributes', () => {
    const r = out()
    expect(r).not.toMatch(/\blang\s*=/i)
    expect(r).not.toMatch(/\bdir\s*=/i)
  })

  it('strips all Mso* class attributes', () => {
    expect(out()).not.toMatch(/Mso[A-Za-z]/)
  })

  it('removes <o:p> tags', () => {
    expect(out()).not.toMatch(/<o:p|<\/o:p>/i)
  })

  it('collapses a run of empty paragraphs to at most one', () => {
    // The two consecutive <o:p>-only MsoNormal paragraphs must not survive as
    // two empty <p></p> blocks.
    const r = out()
    const emptyParas = r.match(/<p>\s*(?:&nbsp;| )?\s*<\/p>/gi) ?? []
    expect(emptyParas.length).toBeLessThanOrEqual(1)
  })

  it('maps style font-weight>=600 span to <strong>', () => {
    const r = out()
    expect(r).toMatch(/<strong>/)
    expect(r).toContain('semibold')
  })

  it('maps style font-style:italic span to <em> (dropping its color)', () => {
    const r = out()
    expect(r).toMatch(/<em>/)
    expect(r).toContain('italic red')
  })

  it('keeps the heading text and real <h1>', () => {
    const r = out()
    expect(r).toMatch(/<h1[ >]/)
    expect(r).toContain('Quarterly Report')
  })

  it('keeps the <b> bold element for the bold word', () => {
    expect(out()).toContain('bold')
  })

  it('converts the MsoListParagraph run into a real list with 3 items', () => {
    const r = out()
    // At minimum: a real <ol> or <ul> containing three <li>.
    expect(r).toMatch(/<(ol|ul)[ >]/i)
    const lis = r.match(/<li[ >]/gi) ?? []
    expect(lis.length).toBe(3)
    expect(r).toContain('First item')
    expect(r).toContain('Second item')
    expect(r).toContain('Third item')
  })

  it('does not leak the mso-list marker text (the "1." bullet glyph span)', () => {
    // The <span style="mso-list:Ignore">1.…</span> literal numbering must be gone.
    const r = out()
    expect(r).not.toMatch(/mso-list/i)
  })
})

// ── Google Docs path ──────────────────────────────────────────────────────────

describe('normalizePastedHtml — GDocs (v0.2.10 spec)', () => {
  const out = () => normalizePastedHtml(GDOCS_FRAGMENT, 'gdocs')

  it('unwraps the docs-internal-guid wrapper', () => {
    expect(out()).not.toMatch(/docs-internal-guid/)
  })

  it('drops all color styles', () => {
    expect(out()).not.toMatch(/color\s*:/i)
  })

  it('drops background-color (highlight) styles', () => {
    expect(out()).not.toMatch(/background/i)
  })

  it('drops font-family styles', () => {
    expect(out()).not.toMatch(/font-family/i)
  })

  it('maps font-weight:700 span to <strong>', () => {
    const r = out()
    expect(r).toMatch(/<strong>/)
    expect(r).toContain('bold red')
  })

  it('maps font-weight:600 span to <strong> too (threshold >=600)', () => {
    expect(out()).toContain('semibold six-hundred')
    // that text must be wrapped in a strong somewhere
    expect(out()).toMatch(/<strong>[^<]*semibold six-hundred[^<]*<\/strong>/)
  })

  it('maps font-style:italic span to <em>', () => {
    const r = out()
    expect(r).toMatch(/<em>/)
    expect(r).toContain('italic hl')
  })

  it('strips dir attributes', () => {
    expect(out()).not.toMatch(/\bdir\s*=/i)
  })
})

// ── Generic web path ──────────────────────────────────────────────────────────

describe('normalizePastedHtml — web (v0.2.10 spec)', () => {
  const out = () => normalizePastedHtml(WEB_FRAGMENT, 'web')

  it('removes <script> content', () => {
    const r = out()
    expect(r).not.toContain('<script')
    expect(r).not.toContain('steal()')
  })

  it('removes onclick/tracking attributes', () => {
    expect(out()).not.toMatch(/onclick/i)
  })

  it('strips class attributes', () => {
    const r = out()
    expect(r).not.toMatch(/class\s*=/i)
  })

  it('drops color and font-family styling', () => {
    const r = out()
    expect(r).not.toMatch(/color\s*:/i)
    expect(r).not.toMatch(/font-family/i)
  })

  it('keeps hyperlinks with their href untouched', () => {
    const r = out()
    expect(r).toMatch(/<a[^>]+href="https:\/\/example\.com\/home"/)
    // tracking params in URLs are left as-is (we do not rewrite URLs)
    expect(r).toContain('utm_source=x')
  })

  it('preserves an http <img src>', () => {
    expect(out()).toMatch(/<img[^>]+src="https:\/\/example\.com\/pic\.png"/)
  })

  it('preserves a data: <img src>', () => {
    expect(out()).toMatch(/<img[^>]+src="data:image\/png;base64,/)
  })

  it('preserves a <pre><code> code block verbatim', () => {
    const r = out()
    expect(r).toMatch(/<pre[ >]/)
    expect(r).toMatch(/<code[ >]?/)
    expect(r).toContain('console.log(x);')
  })

  it('preserves the table with colspan and rowspan', () => {
    const r = out()
    expect(r).toMatch(/<table[ >]/)
    expect(r).toMatch(/colspan="2"/)
    expect(r).toMatch(/rowspan="2"/)
    expect(r).toContain('Header spans two')
  })

  it('maps inline-style bold/italic/underline spans to semantic tags', () => {
    const r = out()
    expect(r).toMatch(/<strong>/)
    expect(r).toMatch(/<em>/)
    expect(r).toMatch(/<u>/)
    expect(r).toContain('bold')
    expect(r).toContain('italic')
    expect(r).toContain('under')
  })
})

// ── Word lists: ordered vs unordered + nesting ───────────────────────────────

const WORD_NUMBERED_LIST = `<html xmlns:w="urn:schemas-microsoft-com:office:word"><body>
<p class="MsoListParagraphCxSpFirst" style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">1.<span style="font:7pt 'Times New Roman'">&nbsp;</span></span>Alpha</p>
<p class="MsoListParagraphCxSpLast" style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">2.<span style="font:7pt 'Times New Roman'">&nbsp;</span></span>Beta</p>
</body></html>`

const WORD_BULLET_LIST = `<html xmlns:w="urn:schemas-microsoft-com:office:word"><body>
<p class="MsoListParagraphCxSpFirst" style="mso-list:l1 level1 lfo2"><span style="mso-list:Ignore">·<span style="font:7pt 'Times New Roman'">&nbsp;</span></span>Dot one</p>
<p class="MsoListParagraphCxSpLast" style="mso-list:l1 level1 lfo2"><span style="mso-list:Ignore">·<span style="font:7pt 'Times New Roman'">&nbsp;</span></span>Dot two</p>
</body></html>`

const WORD_NESTED_LIST = `<html xmlns:w="urn:schemas-microsoft-com:office:word"><body>
<p class="MsoListParagraphCxSpFirst" style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">1.</span>Top one</p>
<p class="MsoListParagraphCxSpMiddle" style="mso-list:l0 level2 lfo1"><span style="mso-list:Ignore">a.</span>Sub a</p>
<p class="MsoListParagraphCxSpMiddle" style="mso-list:l0 level2 lfo1"><span style="mso-list:Ignore">b.</span>Sub b</p>
<p class="MsoListParagraphCxSpLast" style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">2.</span>Top two</p>
</body></html>`

describe('normalizePastedHtml — Word lists (ordered/unordered/nesting)', () => {
  it('turns a numbered Word list into an <ol>', () => {
    const r = normalizePastedHtml(WORD_NUMBERED_LIST, 'word')
    expect(r).toMatch(/<ol[ >]/i)
    expect(r).toContain('Alpha')
    expect(r).toContain('Beta')
    // The literal "1." marker glyph must NOT leak into the item text.
    expect(r).not.toMatch(/<li[^>]*>\s*1\./)
  })

  it('turns a bulleted Word list into a <ul>', () => {
    const r = normalizePastedHtml(WORD_BULLET_LIST, 'word')
    expect(r).toMatch(/<ul[ >]/i)
    expect(r).toContain('Dot one')
    // The literal "·" bullet glyph must NOT leak into the item text.
    expect(r).not.toMatch(/<li[^>]*>\s*·/)
  })

  it('nests level2 items inside the level1 item (best-effort nesting)', () => {
    const r = normalizePastedHtml(WORD_NESTED_LIST, 'word')
    // A list nested INSIDE a list item.
    expect(r).toMatch(/<li>[\s\S]*<(ol|ul)[ >][\s\S]*<\/li>/i)
    expect(r).toContain('Sub a')
    expect(r).toContain('Sub b')
    expect(r).toContain('Top two')
    // 2 top-level items + 2 nested items = 4 <li> total.
    const topLis = r.match(/<li[ >]/gi) ?? []
    expect(topLis.length).toBe(4)
  })
})

// ── Word heading classes / outline levels → real headings ────────────────────

describe('normalizePastedHtml — Word heading mapping', () => {
  it('maps <p class="MsoHeading3"> to <h3>', () => {
    const html = `<html xmlns:w="urn:schemas-microsoft-com:office:word"><body>
      <p class="MsoHeading3" style="mso-style-link:h3">Sub-sub title</p>
    </body></html>`
    const r = normalizePastedHtml(html, 'word')
    expect(r).toMatch(/<h3[ >]/i)
    expect(r).toContain('Sub-sub title')
  })

  it('maps <p class="MsoTitle"> to <h1>', () => {
    const html = `<html xmlns:w="urn:schemas-microsoft-com:office:word"><body>
      <p class="MsoTitle">Doc Title</p>
    </body></html>`
    const r = normalizePastedHtml(html, 'word')
    expect(r).toMatch(/<h1[ >]/i)
    expect(r).toContain('Doc Title')
  })

  it('maps mso-outline-level:2 on a paragraph to <h2>', () => {
    const html = `<html xmlns:w="urn:schemas-microsoft-com:office:word"><body>
      <p class="MsoNormal" style="mso-outline-level:2">Outlined heading</p>
    </body></html>`
    const r = normalizePastedHtml(html, 'word')
    expect(r).toMatch(/<h2[ >]/i)
    expect(r).toContain('Outlined heading')
  })
})

// ── Internal round-trip guard (regression) ────────────────────────────────────

describe('internal ProseMirror clipboard passthrough (data-pm-slice)', () => {
  it('classifies data-pm-slice HTML as plain', () => {
    const pm =
      '<meta charset="utf-8"><p data-pm-slice="1 1 []">Hi <span style="color:red">world</span></p>'
    expect(sniffPasteSource(pm, '')).toBe('plain')
  })

  it('passes internal clipboard HTML through UNCHANGED (keeps color/marks)', () => {
    const pm = '<p data-pm-slice="1 1 []">Hi <span style="color:red">world</span></p>'
    // Even though it contains color styling, plain source must not be touched —
    // internal copy/paste keeps full fidelity.
    expect(normalizePastedHtml(pm, 'plain')).toBe(pm)
  })
})
