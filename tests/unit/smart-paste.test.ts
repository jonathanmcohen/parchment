// @vitest-environment jsdom
/**
 * G14 — Smart paste unit tests.
 * Uses jsdom so DOMParser is available for normalizePastedHtml.
 */
import { describe, expect, it } from 'vitest'
import { looksLikeMarkdown, normalizePastedHtml, sniffPasteSource } from '@/lib/editor/smart-paste'

// ── Fixtures ────────────────────────────────────────────────────────────────

const WORD_HTML = `
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word">
<body>
<h1 class="MsoHeading1" style="mso-style-name:heading1; color:black">My Heading</h1>
<p class="MsoNormal" style="mso-margin-top:0; font-size:12pt">Hello <b>world</b></p>
<o:p></o:p>
</body></html>`

const GDOCS_HTML = `
<html>
<body>
<b id="docs-internal-guid-abc123" style="">
  <h2 style="line-height:1.38">Chapter One</h2>
  <p>Normal text and
    <span style="font-weight:700">bold text</span> and
    <span style="font-style:italic">italic text</span>
  </p>
</b>
</body></html>`

const NOTION_HTML = `
<html>
<body>
<div class="notion-page-content" data-block-id="abc123">
  <h2 class="notion-header-block" data-content-editable-leaf="true">Title</h2>
  <p>Some content</p>
</div>
</body></html>`

const WEB_HTML = `
<html>
<body>
<h2>Article Title</h2>
<p onclick="track()" data-tracking="xyz">Hello</p>
<script>alert('xss')</script>
<p>More content</p>
</body></html>`

// ── sniffPasteSource ─────────────────────────────────────────────────────────

describe('sniffPasteSource', () => {
  it('detects Word via mso- marker', () => {
    expect(sniffPasteSource(WORD_HTML, '')).toBe('word')
  })

  it('detects Word via <w: namespace', () => {
    expect(
      sniffPasteSource(
        '<html xmlns:w="urn:schemas-microsoft-com:office:word"><body></body></html>',
        '',
      ),
    ).toBe('word')
  })

  it('detects GDocs via docs-internal-guid', () => {
    expect(sniffPasteSource(GDOCS_HTML, '')).toBe('gdocs')
  })

  it('detects Notion via data-block-id', () => {
    expect(sniffPasteSource(NOTION_HTML, '')).toBe('notion')
  })

  it('detects Notion via notion-* class', () => {
    expect(sniffPasteSource('<div class="notion-page-content">x</div>', '')).toBe('notion')
  })

  it('detects web HTML when HTML is present with no foreign markers', () => {
    expect(sniffPasteSource(WEB_HTML, '')).toBe('web')
  })

  it('detects markdown when no HTML and text looks like markdown', () => {
    expect(sniffPasteSource('', '# Heading\n- item')).toBe('markdown')
  })

  it('returns plain when no HTML and plain text', () => {
    expect(sniffPasteSource('', 'just some plain text here')).toBe('plain')
  })

  it('returns plain for empty html and empty text', () => {
    expect(sniffPasteSource('', '')).toBe('plain')
  })

  it('returns plain for ProseMirror internal clipboard HTML (data-pm-slice)', () => {
    const pmHtml = '<p data-pm-slice="1 1 []">Hello <span style="color:red">world</span></p>'
    expect(sniffPasteSource(pmHtml, '')).toBe('plain')
  })

  it('returns plain for PM HTML with meta charset prefix', () => {
    const pmHtml = '<meta charset="utf-8"><p data-pm-slice="0 0 []">text</p>'
    expect(sniffPasteSource(pmHtml, '')).toBe('plain')
  })
})

// ── looksLikeMarkdown ────────────────────────────────────────────────────────

describe('looksLikeMarkdown', () => {
  it('returns true for ATX heading', () => {
    expect(looksLikeMarkdown('# Hello World')).toBe(true)
  })

  it('returns true for ## heading', () => {
    expect(looksLikeMarkdown('## Section\nsome text')).toBe(true)
  })

  it('returns true for unordered list item', () => {
    expect(looksLikeMarkdown('- item one\n- item two')).toBe(true)
  })

  it('returns true for ordered list item', () => {
    expect(looksLikeMarkdown('1. First item\n2. Second')).toBe(true)
  })

  it('returns true for fenced code block', () => {
    expect(looksLikeMarkdown('```js\nconst x = 1\n```')).toBe(true)
  })

  it('returns true for **bold** syntax', () => {
    expect(looksLikeMarkdown('some **bold** text')).toBe(true)
  })

  it('returns true for `code` syntax', () => {
    expect(looksLikeMarkdown('use `console.log` here')).toBe(true)
  })

  it('returns false for a plain prose sentence', () => {
    expect(looksLikeMarkdown('This is just a plain sentence with no markdown.')).toBe(false)
  })

  it('returns false for an HTML string', () => {
    expect(looksLikeMarkdown('<p>Hello <strong>world</strong></p>')).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(looksLikeMarkdown('')).toBe(false)
  })
})

// ── normalizePastedHtml ──────────────────────────────────────────────────────

describe('normalizePastedHtml — Word', () => {
  it('strips mso- styles while keeping heading text', () => {
    const result = normalizePastedHtml(WORD_HTML, 'word')
    expect(result).not.toMatch(/mso-/)
    expect(result).toContain('My Heading')
  })

  it('strips MsoHeading class attributes', () => {
    const result = normalizePastedHtml(WORD_HTML, 'word')
    expect(result).not.toMatch(/MsoHeading|MsoNormal/)
  })

  it('strips <o:p> tags', () => {
    const result = normalizePastedHtml(WORD_HTML, 'word')
    expect(result).not.toMatch(/<o:p|<\/o:p>/)
  })

  it('preserves bold text', () => {
    const result = normalizePastedHtml(WORD_HTML, 'word')
    expect(result).toContain('world')
  })
})

describe('normalizePastedHtml — GDocs', () => {
  it('converts font-weight:700 span to <strong>', () => {
    const result = normalizePastedHtml(GDOCS_HTML, 'gdocs')
    expect(result).toContain('<strong>')
    expect(result).toContain('bold text')
  })

  it('unwraps the docs-internal-guid wrapper', () => {
    const result = normalizePastedHtml(GDOCS_HTML, 'gdocs')
    expect(result).not.toMatch(/docs-internal-guid/)
  })

  it('converts font-style:italic span to <em>', () => {
    const result = normalizePastedHtml(GDOCS_HTML, 'gdocs')
    expect(result).toContain('<em>')
    expect(result).toContain('italic text')
  })

  it('converts text-decoration:underline span to <u>', () => {
    const html = `<html><body><p><span style="text-decoration: underline">underlined</span></p></body></html>`
    const result = normalizePastedHtml(html, 'gdocs')
    expect(result).toContain('<u>')
    expect(result).toContain('underlined')
  })
})

describe('normalizePastedHtml — web', () => {
  it('removes <script> tags', () => {
    const result = normalizePastedHtml(WEB_HTML, 'web')
    expect(result).not.toContain('<script>')
    expect(result).not.toContain("alert('xss')")
  })

  it('removes onclick attribute', () => {
    const result = normalizePastedHtml(WEB_HTML, 'web')
    expect(result).not.toContain('onclick')
  })

  it('preserves <p> and <h2> elements', () => {
    const result = normalizePastedHtml(WEB_HTML, 'web')
    expect(result).toContain('<p>')
    expect(result).toContain('<h2>')
  })

  it('preserves text content', () => {
    const result = normalizePastedHtml(WEB_HTML, 'web')
    expect(result).toContain('Article Title')
    expect(result).toContain('Hello')
    expect(result).toContain('More content')
  })
})

describe('normalizePastedHtml — plain pass-through', () => {
  it('returns html unchanged for plain source', () => {
    const html = '<p>hello world</p>'
    expect(normalizePastedHtml(html, 'plain')).toBe(html)
  })

  it('returns html unchanged for markdown source', () => {
    const html = '<p>some text</p>'
    expect(normalizePastedHtml(html, 'markdown')).toBe(html)
  })

  it('PM clipboard HTML (data-pm-slice) is classified plain and passed through unchanged', () => {
    const pmHtml = '<p data-pm-slice="1 1 []">Hello <span style="color:red">world</span></p>'
    // sniffPasteSource returns 'plain', so normalizePastedHtml must not touch it
    expect(sniffPasteSource(pmHtml, '')).toBe('plain')
    expect(normalizePastedHtml(pmHtml, 'plain')).toBe(pmHtml)
  })
})
