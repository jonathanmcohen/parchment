// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { docToStandaloneHtml } from '@/lib/export/html'

const simpleDoc = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'Hello, export world!' }],
    },
  ],
}

describe('docToStandaloneHtml', () => {
  it('output starts with <!doctype html', () => {
    const html = docToStandaloneHtml(simpleDoc, 'Test Doc')
    expect(html.toLowerCase()).toMatch(/^<!doctype html/)
  })

  it('contains the title (unescaped safe title)', () => {
    const html = docToStandaloneHtml(simpleDoc, 'My Document')
    expect(html).toContain('<title>My Document</title>')
  })

  it('escapes a title containing < and >', () => {
    const html = docToStandaloneHtml(simpleDoc, 'Doc <script>alert(1)</script>')
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('contains <style> block', () => {
    const html = docToStandaloneHtml(simpleDoc, 'Doc')
    expect(html).toContain('<style>')
  })

  it('contains NO <script tag', () => {
    const html = docToStandaloneHtml(simpleDoc, 'Doc')
    expect(html.toLowerCase()).not.toContain('<script')
  })

  it('contains the rendered content text', () => {
    const html = docToStandaloneHtml(simpleDoc, 'Doc')
    expect(html).toContain('Hello, export world!')
  })
})
