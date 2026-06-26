/** Render a PM doc JSON to a STANDALONE HTML document string.
 *  Uses renderToStaticMarkup(renderReadOnlyDoc(doc)) for the body.
 *  NO <script>. NO external resources. Never throws. */

import { renderReadOnlyDoc } from '@/components/share/render-pm'

// react-dom/server is imported DYNAMICALLY inside docToStandaloneHtml: a static
// top-level `import 'react-dom/server'` in a module that also imports a component
// (render-pm) makes Next/Turbopack reject the build ("importing a component that
// imports react-dom/server"). The dynamic import keeps it out of the static graph.
// (The unit gate doesn't run the Next bundler, so only `pnpm build` surfaced this.)

// Similarly, getHighlighter / ensureLanguage are dynamically imported inside
// docToStandaloneHtml. The Shiki highlighter.ts module uses a singleton that
// needs `shiki` (a server-only library) and having it in the static import
// graph of this module could create bundler issues with Turbopack.

/** Validated color regex: only allow CSS hex colors (#rgb, #rrggbb, #rrggbbaa) */
const SAFE_COLOR_RE = /^#[0-9a-fA-F]{3,8}$/

/**
 * Escape a string for safe HTML text content.
 * Escapes & < > " '
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Convert Shiki token lines to an HTML string for use in dangerouslySetInnerHTML.
 * Each token's color is validated against /^#[0-9a-fA-F]{3,8}$/ before inlining.
 * If the color fails validation, the text is emitted as escaped text with no style span.
 * Lines are joined with '\n'.
 * This is a pure function suitable for unit testing.
 */
export function tokensToExportHtml(
  lines: { content: string; color?: string | undefined }[][],
): string {
  return lines
    .map((line) =>
      line
        .map((token) => {
          const escaped = escapeHtml(token.content)
          if (
            token.color !== undefined &&
            token.color !== null &&
            SAFE_COLOR_RE.test(token.color)
          ) {
            return `<span style="color:${token.color}">${escaped}</span>`
          }
          return escaped
        })
        .join(''),
    )
    .join('\n')
}

type PMNode = {
  type?: string
  attrs?: Record<string, unknown>
  content?: PMNode[]
  text?: string
  marks?: unknown[]
}

/**
 * Walk a ProseMirror doc JSON and rewrite 'plantuml' nodes to a safe
 * source-in-pre representation so the exported HTML never contains an
 * external resource URL (the plantumlImageUrl() path is gated by
 * NEXT_PUBLIC_PLANTUML_SERVER_URL; we must not emit that URL in a
 * self-contained file regardless of server configuration).
 */
function stripPlantumlToSource(node: PMNode): PMNode {
  if (node.type === 'plantuml') {
    const src = typeof node.attrs?.source === 'string' ? node.attrs.source : ''
    return {
      type: 'codeBlock',
      attrs: { language: 'plantuml' },
      content: src ? [{ type: 'text', text: src }] : [],
    }
  }
  if (!node.content) return node
  return { ...node, content: node.content.map(stripPlantumlToSource) }
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

/**
 * Walk a PM doc and annotate codeBlock nodes with syntax-highlighted HTML via
 * Shiki. Returns a new doc with each highlightable codeBlock's attrs augmented
 * with `__exportHtml` (the pre-built inner HTML string). Nodes with unsupported
 * or plaintext languages are left unchanged.
 *
 * This is intentionally wrapped in try/catch at the call site — any failure
 * falls back to the unmodified doc (plaintext rendering).
 */
async function annotateCodeBlocksWithShiki(
  node: PMNode,
  hl: import('shiki').Highlighter,
  ensureLanguage: (lang: string) => Promise<boolean>,
  normalizeLang: (lang: string | null | undefined) => string,
  isSupportedLanguage: (lang: string) => boolean,
  theme: string,
): Promise<PMNode> {
  if (node.type === 'codeBlock') {
    // Defense-in-depth: never trust a pre-existing __exportHtml from stored
    // content — strip it, then set our own only for blocks we actually
    // highlight. (render-pm additionally gates this attr behind export mode, so
    // a forged value can never reach the public viewer either way.)
    const safeAttrs: Record<string, unknown> = { ...(node.attrs ?? {}) }
    delete safeAttrs.__exportHtml
    const baseNode: PMNode = { ...node, attrs: safeAttrs }

    const lang = normalizeLang(typeof safeAttrs.language === 'string' ? safeAttrs.language : null)
    // Skip plaintext and unsupported languages.
    if (lang !== 'plaintext' && isSupportedLanguage(lang)) {
      const ready = await ensureLanguage(lang)
      if (ready) {
        const code = (node.content ?? [])
          .filter((c) => c.type === 'text')
          .map((c) => c.text ?? '')
          .join('')
        try {
          const lines = hl.codeToTokensBase(code, {
            // biome-ignore lint/suspicious/noExplicitAny: Shiki's BundledLanguage is a large union; we guard with isSupportedLanguage before reaching here
            lang: lang as any,
            // biome-ignore lint/suspicious/noExplicitAny: Shiki's BundledTheme is a large union; DEFAULT_THEME is always valid
            theme: theme as any,
          })
          return { ...baseNode, attrs: { ...safeAttrs, __exportHtml: tokensToExportHtml(lines) } }
        } catch {
          // Tokenization failed — fall through to the stripped (plaintext) node.
        }
      }
    }
    return baseNode
  }
  if (!node.content) return node
  const newContent = await Promise.all(
    node.content.map((child) =>
      annotateCodeBlocksWithShiki(
        child,
        hl,
        ensureLanguage,
        normalizeLang,
        isSupportedLanguage,
        theme,
      ),
    ),
  )
  return { ...node, content: newContent }
}

/**
 * Public, reusable Shiki pre-pass for the export/print pipeline.
 *
 * Given a ProseMirror doc JSON, returns a NEW doc whose highlightable codeBlock
 * nodes carry a pre-built, escaped + hex-color-validated `__exportHtml` attr.
 * That attr is ONLY honoured by render-pm when it is called with
 * `exportHighlight: true`; the public share viewer ignores it. Combined with the
 * defense-in-depth strip of any forged incoming `__exportHtml`, this keeps the
 * XSS surface closed.
 *
 * Plantuml nodes are first downgraded to a source-in-pre codeBlock so no external
 * resource URL is ever embedded (mirrors docToStandaloneHtml).
 *
 * The whole thing is wrapped in try/catch: if Shiki is unavailable or any step
 * fails, the (plantuml-stripped) doc is returned unchanged so callers fall back
 * to plaintext code blocks. Never throws.
 *
 * @param theme A Shiki theme id; defaults to the LIGHT `github-light` so the
 *   output reads correctly on white paper (PDF/print) and white export pages.
 */
export async function annotateDocWithShiki(doc: unknown, theme?: string): Promise<unknown> {
  // Strip plantuml nodes to their source-in-pre fallback before highlighting so
  // the result never references an external resource URL.
  const safeDoc = doc && typeof doc === 'object' ? stripPlantumlToSource(doc as PMNode) : doc
  try {
    const { getHighlighter, ensureLanguage, DEFAULT_THEME } = await import(
      '@/lib/editor/shiki/highlighter'
    )
    const { normalizeLang, isSupportedLanguage } = await import('@/lib/editor/shiki/languages')
    const hl = await getHighlighter()
    return await annotateCodeBlocksWithShiki(
      safeDoc as PMNode,
      hl,
      ensureLanguage,
      normalizeLang,
      isSupportedLanguage,
      theme ?? DEFAULT_THEME,
    )
  } catch {
    // Shiki unavailable or failed — return the (plantuml-stripped) doc so callers
    // render plaintext code blocks.
    return safeDoc
  }
}

export async function docToStandaloneHtml(doc: unknown, title: string): Promise<string> {
  try {
    const { renderToStaticMarkup } = await import('react-dom/server')
    // Strip plantuml nodes + annotate codeBlocks with Shiki HTML in one pass.
    // annotateDocWithShiki is self-contained (own try/catch) and returns the
    // plantuml-stripped doc unchanged if Shiki is unavailable.
    const safeDoc = await annotateDocWithShiki(doc)

    // exportHighlight: true authorizes render-pm to emit our pre-built code-block
    // HTML for THIS render only — no other caller (public viewer included) does.
    const bodyNode = renderReadOnlyDoc(safeDoc, { exportHighlight: true })
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
