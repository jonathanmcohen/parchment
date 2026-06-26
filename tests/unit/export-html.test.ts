// @vitest-environment node
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { renderReadOnlyDoc } from '@/components/share/render-pm'
import {
  annotateDocWithShiki,
  docToStandaloneHtml,
  escapeHtml,
  tokensToExportHtml,
} from '@/lib/export/html'

const simpleDoc = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'Hello, export world!' }],
    },
  ],
}

const plantumlDoc = {
  type: 'doc',
  content: [
    {
      type: 'plantuml',
      attrs: { source: '@startuml\nAlice -> Bob: Hello\n@enduml' },
    },
  ],
}

const jsCodeDoc = {
  type: 'doc',
  content: [
    {
      type: 'codeBlock',
      attrs: { language: 'javascript' },
      content: [{ type: 'text', text: 'const x = 1;\nconsole.log(x);' }],
    },
  ],
}

const plaintextCodeDoc = {
  type: 'doc',
  content: [
    {
      type: 'codeBlock',
      attrs: { language: 'plaintext' },
      content: [{ type: 'text', text: 'just plain text here' }],
    },
  ],
}

const unknownLangCodeDoc = {
  type: 'doc',
  content: [
    {
      type: 'codeBlock',
      attrs: { language: 'unknownxyzlang' },
      content: [{ type: 'text', text: 'no highlighting here' }],
    },
  ],
}

const xssCodeDoc = {
  type: 'doc',
  content: [
    {
      type: 'codeBlock',
      attrs: { language: 'javascript' },
      content: [{ type: 'text', text: '<script>"&\'' }],
    },
  ],
}

describe('docToStandaloneHtml', () => {
  it('output starts with <!doctype html', async () => {
    const html = await docToStandaloneHtml(simpleDoc, 'Test Doc')
    expect(html.toLowerCase()).toMatch(/^<!doctype html/)
  })

  it('contains the title (unescaped safe title)', async () => {
    const html = await docToStandaloneHtml(simpleDoc, 'My Document')
    expect(html).toContain('<title>My Document</title>')
  })

  it('escapes a title containing < and >', async () => {
    const html = await docToStandaloneHtml(simpleDoc, 'Doc <script>alert(1)</script>')
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('contains <style> block', async () => {
    const html = await docToStandaloneHtml(simpleDoc, 'Doc')
    expect(html).toContain('<style>')
  })

  it('contains NO <script tag', async () => {
    const html = await docToStandaloneHtml(simpleDoc, 'Doc')
    expect(html.toLowerCase()).not.toContain('<script')
  })

  it('contains the rendered content text', async () => {
    const html = await docToStandaloneHtml(simpleDoc, 'Doc')
    expect(html).toContain('Hello, export world!')
  })

  it('plantuml node is rendered as <pre> source — no external URL', async () => {
    // Simulate NEXT_PUBLIC_PLANTUML_SERVER_URL being set by checking that the
    // output never contains an http(s):// src attribute regardless.
    const html = await docToStandaloneHtml(plantumlDoc, 'Diagram Doc')
    // Must not contain any external URL as an img src
    expect(html).not.toMatch(/src=["']https?:\/\//i)
    // The plantuml source text must appear (rendered as <pre> fallback)
    expect(html).toContain('@startuml')
  })

  it('(a) JavaScript code block exports with colored <span style="color:#..."> tokens', async () => {
    const html = await docToStandaloneHtml(jsCodeDoc, 'JS Code')
    // Should contain the pre/code wrapper
    expect(html).toContain('<pre>')
    expect(html).toContain('<code')
    // Should contain colored spans with valid hex color values from Shiki
    // github-light theme colors JS keywords/identifiers
    expect(html).toMatch(/style="color:#[0-9a-fA-F]{3,8}"/)
    // The code content should appear somewhere (escaped if needed)
    expect(html).toContain('console')
  })

  it('(b) plaintext code block exports as plain <pre><code> with NO color spans', async () => {
    const html = await docToStandaloneHtml(plaintextCodeDoc, 'Plain Code')
    expect(html).toContain('<pre>')
    expect(html).toContain('just plain text here')
    // No colored spans — plaintext blocks skip Shiki
    expect(html).not.toMatch(/style="color:#/)
  })

  it('(b) unknown language code block exports as plain <pre><code> with NO color spans', async () => {
    const html = await docToStandaloneHtml(unknownLangCodeDoc, 'Unknown Code')
    expect(html).toContain('<pre>')
    expect(html).toContain('no highlighting here')
    // No colored spans — unknown languages fall through to plaintext
    expect(html).not.toMatch(/style="color:#/)
  })

  it('(c) escapes XSS characters in a code block containing <script>"&\'', async () => {
    const html = await docToStandaloneHtml(xssCodeDoc, 'XSS Test')
    // The raw <script> tag should NOT appear unescaped in the output
    expect(html).not.toContain('<script>')
    // < and > must be escaped as HTML entities somewhere in the output
    // (Shiki may tokenize them into separate tokens so &lt;script&gt; may not be
    //  a contiguous string, but the individual escapes must be present)
    expect(html).toContain('&lt;')
    expect(html).toContain('&gt;')
    expect(html).toContain('&amp;')
    // Verify the code block output has proper escaping — extract <code>...</code>
    const codeMatch = html.match(/<code[^>]*>([\s\S]*?)<\/code>/i)
    expect(codeMatch).not.toBeNull()
    const codeContent = codeMatch?.[1] ?? ''
    // No unescaped < tag start in the code content (only HTML tags we emit like <span>)
    // The word "script" itself may appear as a Shiki token text but not as a tag
    expect(codeContent).not.toMatch(/<script/i)
  })
})

describe('escapeHtml (pure helper)', () => {
  it('escapes & < > " and \'', () => {
    expect(escapeHtml('&')).toBe('&amp;')
    expect(escapeHtml('<')).toBe('&lt;')
    expect(escapeHtml('>')).toBe('&gt;')
    expect(escapeHtml('"')).toBe('&quot;')
    expect(escapeHtml("'")).toBe('&#39;')
  })

  it('escapes all chars in a combined string', () => {
    const result = escapeHtml('<script>"&\'')
    expect(result).toBe('&lt;script&gt;&quot;&amp;&#39;')
  })

  it('leaves safe text unchanged', () => {
    expect(escapeHtml('hello world')).toBe('hello world')
    expect(escapeHtml('const x = 1;')).toBe('const x = 1;')
  })
})

describe('tokensToExportHtml (pure helper)', () => {
  it('emits <span style="color:#rrggbb"> for valid hex colors', () => {
    const lines = [
      [
        { content: 'const', color: '#0000ff' },
        { content: ' x', color: '#333333' },
      ],
    ]
    const result = tokensToExportHtml(lines)
    expect(result).toBe(
      '<span style="color:#0000ff">const</span><span style="color:#333333"> x</span>',
    )
  })

  it('(d) rejects an invalid color and emits text with no style attribute', () => {
    const lines = [[{ content: 'evil', color: 'red;}<x' }]]
    const result = tokensToExportHtml(lines)
    // Invalid color: no style attribute, just escaped text
    expect(result).toBe('evil')
    expect(result).not.toContain('style=')
    expect(result).not.toContain('red;}<x')
  })

  it('(d) rejects javascript: color injection', () => {
    const lines = [[{ content: 'x', color: 'javascript:alert(1)' }]]
    const result = tokensToExportHtml(lines)
    expect(result).toBe('x')
    expect(result).not.toContain('style=')
  })

  it('accepts short (#rgb) and long (#rrggbbaa) hex colors', () => {
    const lines = [
      [
        { content: 'a', color: '#abc' },
        { content: 'b', color: '#aabbccdd' },
      ],
    ]
    const result = tokensToExportHtml(lines)
    expect(result).toContain('color:#abc')
    expect(result).toContain('color:#aabbccdd')
  })

  it('escapes HTML in token content', () => {
    const lines = [[{ content: '<b>bold</b>', color: '#000000' }]]
    const result = tokensToExportHtml(lines)
    expect(result).toContain('&lt;b&gt;bold&lt;/b&gt;')
    expect(result).not.toContain('<b>')
  })

  it('joins lines with newline', () => {
    const lines = [
      [{ content: 'line1', color: '#111111' }],
      [{ content: 'line2', color: '#222222' }],
    ]
    const result = tokensToExportHtml(lines)
    expect(result).toContain('\n')
    const parts = result.split('\n')
    expect(parts).toHaveLength(2)
    expect(parts[0]).toContain('line1')
    expect(parts[1]).toContain('line2')
  })

  it('emits plain text (no span) for token with no color', () => {
    const lines = [[{ content: 'nocolor' }]]
    const result = tokensToExportHtml(lines)
    expect(result).toBe('nocolor')
    expect(result).not.toContain('<span')
  })

  it('handles empty lines array', () => {
    expect(tokensToExportHtml([])).toBe('')
  })

  it('handles empty line (empty token array)', () => {
    const result = tokensToExportHtml([[]])
    expect(result).toBe('')
  })
})

// P7 hardening: __exportHtml is raw HTML the export pre-pass builds itself. The
// public render path must NEVER honor a stored/forged __exportHtml, and the
// export pre-pass strips any pre-existing one — so a crafted contentJson can't
// turn render-pm into a stored-XSS sink.
describe('render-pm export-mode gate (P7 XSS hardening)', () => {
  const forged = {
    type: 'doc',
    content: [
      {
        type: 'codeBlock',
        attrs: { language: 'plaintext', __exportHtml: '<img src=x onerror="alert(1)">' },
        content: [{ type: 'text', text: 'safe code' }],
      },
    ],
  }

  it('does NOT emit a stored/forged __exportHtml as raw HTML in the public render path', () => {
    // ShareViewer / reading / print call renderReadOnlyDoc WITHOUT exportHighlight.
    const html = renderToStaticMarkup(renderReadOnlyDoc(forged) as ReactElement)
    expect(html).not.toContain('onerror')
    expect(html).not.toContain('<img')
    expect(html).toContain('safe code')
  })

  it('strips a forged __exportHtml during HTML export so it never reaches output', async () => {
    const html = await docToStandaloneHtml(forged, 'Forged')
    expect(html).not.toContain('onerror')
    expect(html).not.toContain('<img')
    expect(html).toContain('safe code')
  })
})

// #14 (v0.1.10): annotateDocWithShiki is the shared export/print pre-pass. It is
// the single entry point PrintView and docToStandaloneHtml both call, so its
// contract (highlight supported langs, leave others untouched, strip forged
// attrs, downgrade plantuml) is what keeps the XSS gate shut across both callers.
type AnnotatedNode = {
  type?: string
  attrs?: Record<string, unknown>
  content?: AnnotatedNode[]
}

describe('annotateDocWithShiki (shared export/print pre-pass)', () => {
  it('adds a non-empty __exportHtml to a supported-language code block', async () => {
    const out = (await annotateDocWithShiki(jsCodeDoc)) as AnnotatedNode
    const block = out.content?.[0]
    expect(block?.type).toBe('codeBlock')
    const exportHtml = block?.attrs?.__exportHtml
    expect(typeof exportHtml).toBe('string')
    expect((exportHtml as string).length).toBeGreaterThan(0)
    // Default theme is light (github-light) — colors are inlined hex spans.
    expect(exportHtml as string).toContain('<span style="color:#')
  })

  it('leaves plaintext code blocks without an __exportHtml attr', async () => {
    const out = (await annotateDocWithShiki(plaintextCodeDoc)) as AnnotatedNode
    const block = out.content?.[0]
    expect(block?.attrs?.__exportHtml).toBeUndefined()
  })

  it('leaves unknown-language code blocks without an __exportHtml attr', async () => {
    const out = (await annotateDocWithShiki(unknownLangCodeDoc)) as AnnotatedNode
    const block = out.content?.[0]
    expect(block?.attrs?.__exportHtml).toBeUndefined()
  })

  it('strips a forged incoming __exportHtml from a plaintext block', async () => {
    const forgedDoc = {
      type: 'doc',
      content: [
        {
          type: 'codeBlock',
          attrs: { language: 'plaintext', __exportHtml: '<img src=x onerror="alert(1)">' },
          content: [{ type: 'text', text: 'safe code' }],
        },
      ],
    }
    const out = (await annotateDocWithShiki(forgedDoc)) as AnnotatedNode
    const block = out.content?.[0]
    expect(block?.attrs?.__exportHtml).toBeUndefined()
  })

  it('downgrades plantuml to a source codeBlock (no external resource leak)', async () => {
    const out = (await annotateDocWithShiki(plantumlDoc)) as AnnotatedNode
    const block = out.content?.[0]
    expect(block?.type).toBe('codeBlock')
    expect(block?.attrs?.language).toBe('plantuml')
  })

  it('never throws on non-object input', async () => {
    await expect(annotateDocWithShiki(null)).resolves.toBeNull()
    await expect(annotateDocWithShiki(undefined)).resolves.toBeUndefined()
  })
})
