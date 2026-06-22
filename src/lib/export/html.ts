/** Render a PM doc JSON to a STANDALONE HTML document string.
 *  Uses renderToStaticMarkup(renderReadOnlyDoc(doc)) for the body.
 *  NO <script>. NO external resources. Never throws. */

import { renderToStaticMarkup } from 'react-dom/server'
import { renderReadOnlyDoc } from '@/components/share/render-pm'

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export const EXPORT_STYLESHEET = `
/* Parchment export stylesheet — standalone, no external resources */
*, *::before, *::after { box-sizing: border-box; }

body {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 1.05rem;
  line-height: 1.7;
  color: #1a1a1a;
  background: #fff;
  margin: 0;
  padding: 2rem 1rem;
}

article.parchment-export {
  max-width: 68ch;
  margin: 0 auto;
}

h1, h2, h3, h4, h5, h6 {
  font-family: Georgia, 'Times New Roman', serif;
  line-height: 1.25;
  margin: 1.75em 0 0.5em;
  font-weight: bold;
}

h1 { font-size: 2rem; }
h2 { font-size: 1.6rem; }
h3 { font-size: 1.35rem; }
h4 { font-size: 1.15rem; }
h5 { font-size: 1rem; }
h6 { font-size: 0.9rem; color: #555; }

p {
  margin: 0 0 1em;
}

ul, ol {
  margin: 0 0 1em;
  padding-left: 2em;
}

li {
  margin-bottom: 0.25em;
}

blockquote {
  margin: 1em 0;
  padding: 0.5em 1em;
  border-left: 4px solid #ccc;
  color: #555;
  font-style: italic;
}

blockquote p { margin: 0; }

pre {
  background: #f5f5f5;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  padding: 1em;
  overflow-x: auto;
  margin: 1em 0;
}

code {
  font-family: ui-monospace, 'Courier New', monospace;
  font-size: 0.88em;
  background: #f0f0f0;
  padding: 0.1em 0.3em;
  border-radius: 3px;
}

pre code {
  background: none;
  padding: 0;
  font-size: 0.9em;
}

table {
  border-collapse: collapse;
  width: 100%;
  margin: 1em 0;
  font-size: 0.95em;
}

th, td {
  border: 1px solid #ccc;
  padding: 0.45em 0.75em;
  text-align: left;
  vertical-align: top;
}

th {
  background: #f5f5f5;
  font-weight: bold;
}

tr:nth-child(even) td {
  background: #fafafa;
}

img {
  max-width: 100%;
  height: auto;
  display: block;
}

hr {
  border: none;
  border-top: 1px solid #ccc;
  margin: 2em 0;
}

a {
  color: #1a6abe;
}

a:visited {
  color: #6b3a9f;
}

strong { font-weight: bold; }
em     { font-style: italic; }
s      { text-decoration: line-through; }
u      { text-decoration: underline; }

sup { vertical-align: super; font-size: 0.75em; }
sub { vertical-align: sub;   font-size: 0.75em; }
`.trim()

export function docToStandaloneHtml(doc: unknown, title: string): string {
  try {
    const bodyNode = renderReadOnlyDoc(doc)
    const bodyHtml = renderToStaticMarkup(bodyNode as React.ReactElement)
    const safeTitle = escapeHtml(title || 'Untitled')
    return [
      '<!doctype html>',
      '<html lang="en">',
      '<head>',
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      `<title>${safeTitle}</title>`,
      `<style>${EXPORT_STYLESHEET}</style>`,
      '</head>',
      '<body>',
      `<article class="parchment-export">${bodyHtml}</article>`,
      '</body>',
      '</html>',
    ].join('\n')
  } catch {
    const safeTitle = escapeHtml(title || 'Untitled')
    return [
      '<!doctype html>',
      '<html lang="en">',
      '<head>',
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      `<title>${safeTitle}</title>`,
      `<style>${EXPORT_STYLESHEET}</style>`,
      '</head>',
      '<body>',
      '<article class="parchment-export"></article>',
      '</body>',
      '</html>',
    ].join('\n')
  }
}
