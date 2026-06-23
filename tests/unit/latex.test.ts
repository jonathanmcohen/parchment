// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { docToLatex } from '@/lib/export/latex'

const heading1Doc = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Hello World' }] },
  ],
}

const heading2Doc = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Sub heading' }] },
  ],
}

const boldDoc = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'bold text', marks: [{ type: 'bold' }] }],
    },
  ],
}

const specialCharsDoc = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'A & B, 50% off, price_tag, cost $10, {curly}' }],
    },
  ],
}

const bulletListDoc = {
  type: 'doc',
  content: [
    {
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Item one' }] }],
        },
        {
          type: 'listItem',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Item two' }] }],
        },
      ],
    },
  ],
}

const mathInlineDoc = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'The formula is ' },
        { type: 'mathInline', attrs: { latex: 'x^2' } },
        { type: 'text', text: ' obviously.' },
      ],
    },
  ],
}

const mathBlockDoc = {
  type: 'doc',
  content: [{ type: 'mathBlock', attrs: { latex: 'E = mc^2' } }],
}

const citationDoc = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'As noted ' },
        { type: 'citation', attrs: { citeKey: 'einstein1905' } },
        { type: 'text', text: '.' },
      ],
    },
    {
      type: 'bibliography',
      attrs: {
        refs: [
          {
            id: 'einstein1905',
            author: 'Einstein, A.',
            year: '1905',
            title: 'On the Electrodynamics of Moving Bodies',
          },
        ],
        style: 'apa',
      },
    },
  ],
}

describe('docToLatex', () => {
  it('heading level 1 → \\section{…}', () => {
    const out = docToLatex(heading1Doc, 'Test')
    expect(out).toContain('\\section{Hello World}')
  })

  it('heading level 2 → \\subsection{…}', () => {
    const out = docToLatex(heading2Doc, 'Test')
    expect(out).toContain('\\subsection{Sub heading}')
  })

  it('bold text → \\textbf{…}', () => {
    const out = docToLatex(boldDoc, 'Test')
    expect(out).toContain('\\textbf{bold text}')
  })

  it('escapes & % _ $ { } in plain text', () => {
    const out = docToLatex(specialCharsDoc, 'Test')
    expect(out).toContain('\\&')
    expect(out).toContain('\\%')
    expect(out).toContain('\\_')
    expect(out).toContain('\\$')
    expect(out).toContain('\\{')
    expect(out).toContain('\\}')
  })

  it('bulletList → \\begin{itemize}…\\item…\\end{itemize}', () => {
    const out = docToLatex(bulletListDoc, 'Test')
    expect(out).toContain('\\begin{itemize}')
    expect(out).toContain('\\item Item one')
    expect(out).toContain('\\item Item two')
    expect(out).toContain('\\end{itemize}')
  })

  it('mathInline x^2 → $x^2$', () => {
    const out = docToLatex(mathInlineDoc, 'Test')
    expect(out).toContain('$x^2$')
  })

  it('mathBlock → display math \\[ E = mc^2 \\]', () => {
    const out = docToLatex(mathBlockDoc, 'Test')
    expect(out).toContain('\\[')
    expect(out).toContain('E = mc^2')
    expect(out).toContain('\\]')
  })

  it('citation → \\cite{key} and bibliography → \\begin{thebibliography}', () => {
    const out = docToLatex(citationDoc, 'Test')
    expect(out).toContain('\\cite{einstein1905}')
    expect(out).toContain('\\begin{thebibliography}')
    expect(out).toContain('\\bibitem{einstein1905}')
    expect(out).toContain('\\end{thebibliography}')
  })

  it('never throws on malformed / null / undefined input', () => {
    expect(() => docToLatex(null, 'Title')).not.toThrow()
    expect(() => docToLatex(undefined, 'Title')).not.toThrow()
    expect(() => docToLatex({ type: 'doc' }, 'Title')).not.toThrow()
    expect(() => docToLatex({}, '')).not.toThrow()
    const out = docToLatex(null, 'Title')
    expect(out).toContain('\\documentclass{article}')
    expect(out).toContain('\\end{document}')
  })
})
