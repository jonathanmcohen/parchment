/** PM doc JSON → a valid EPUB 3 as a Uint8Array.
 *
 * ZIP structure (mimetype MUST be first with STORE compression per EPUB spec):
 *   mimetype                     (STORE, no compression)
 *   META-INF/container.xml
 *   OEBPS/content.opf            (manifest + spine)
 *   OEBPS/nav.xhtml              (TOC navigation document)
 *   OEBPS/chapter.xhtml          (the doc body as XHTML)
 *   OEBPS/style.css
 *
 * Body XHTML is produced by renderReadOnlyDoc (the same React component used
 * by the HTML exporter) and serialized via renderToStaticMarkup — which already
 * produces valid XML-ish HTML with self-closed void tags. Both imports are
 * dynamic to avoid the Next.js bundler error triggered by static imports of
 * react-dom/server inside a module that also imports a React component.
 *
 * Never throws — on error returns a minimal valid epub.
 */

type PMNode = {
  type?: string
  attrs?: Record<string, unknown>
  content?: PMNode[]
  text?: string
  marks?: unknown[]
}

/**
 * Walk a PM doc JSON and rewrite 'plantuml' nodes to a codeBlock containing
 * the source text. Mirrors html.ts's stripPlantumlToSource — prevents the
 * render-pm plantuml case from emitting an <img> with an external server URL,
 * which would violate the EPUB spec (remote-resources not declared in content.opf)
 * and cause epubcheck failures.
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

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function containerXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
}

function contentOpf(title: string, uid: string): string {
  const safeTitle = escapeXml(title || 'Untitled')
  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">${escapeXml(uid)}</dc:identifier>
    <dc:title>${safeTitle}</dc:title>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/>
    <item id="css" href="style.css" media-type="text/css"/>
  </manifest>
  <spine>
    <itemref idref="chapter"/>
  </spine>
</package>`
}

function navXhtml(title: string): string {
  const safeTitle = escapeXml(title || 'Untitled')
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>${safeTitle}</title>
</head>
<body>
  <nav epub:type="toc">
    <h1>Table of Contents</h1>
    <ol>
      <li><a href="chapter.xhtml">${safeTitle}</a></li>
    </ol>
  </nav>
</body>
</html>`
}

function chapterXhtml(title: string, bodyXhtml: string): string {
  const safeTitle = escapeXml(title || 'Untitled')
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>${safeTitle}</title>
  <link rel="stylesheet" href="style.css"/>
</head>
<body>
${bodyXhtml}
</body>
</html>`
}

const EPUB_CSS = `
body {
  font-family: Georgia, serif;
  font-size: 1em;
  line-height: 1.6;
  color: #1a1a1a;
  margin: 1em 2em;
}
h1, h2, h3, h4, h5, h6 {
  font-family: Georgia, serif;
  line-height: 1.25;
  margin: 1.5em 0 0.5em;
}
p { margin: 0 0 0.8em; }
ul, ol { margin: 0 0 0.8em; padding-left: 2em; }
blockquote {
  margin: 1em 0;
  padding: 0.5em 1em;
  border-left: 3px solid #ccc;
  font-style: italic;
  color: #555;
}
pre {
  background: #f5f5f5;
  padding: 0.8em;
  overflow-x: auto;
}
code {
  font-family: monospace;
  font-size: 0.9em;
}
table {
  border-collapse: collapse;
  width: 100%;
}
th, td {
  border: 1px solid #ccc;
  padding: 0.4em 0.6em;
}
img { max-width: 100%; }
`.trim()

/** Generate a simple unique ID (no crypto dep). */
function makeUid(): string {
  const now = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 8)
  return `parchment-${now}-${rand}`
}

export async function docToEpub(doc: unknown, title: string): Promise<Uint8Array> {
  try {
    const JSZip = (await import('jszip')).default
    const { renderReadOnlyDoc } = await import('@/components/share/render-pm')
    const { renderToStaticMarkup } = await import('react-dom/server')

    // Strip plantuml nodes before rendering — render-pm emits <img src="<external-url>">
    // for plantuml when NEXT_PUBLIC_PLANTUML_SERVER_URL is set, which violates the
    // EPUB spec (remote resources not declared in content.opf) and breaks epubcheck.
    const safeDoc = doc && typeof doc === 'object' ? stripPlantumlToSource(doc as PMNode) : doc

    // Render the body — reuse the same React component the HTML exporter uses
    let bodyXhtml = ''
    try {
      const bodyNode = renderReadOnlyDoc(safeDoc)
      bodyXhtml = renderToStaticMarkup(bodyNode as React.ReactElement)
    } catch {
      bodyXhtml = '<p></p>'
    }

    const uid = makeUid()
    const zip = new JSZip()

    // mimetype MUST be first and MUST use STORE (no compression) per EPUB spec
    zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })

    zip.file('META-INF/container.xml', containerXml())
    zip.file('OEBPS/content.opf', contentOpf(title, uid))
    zip.file('OEBPS/nav.xhtml', navXhtml(title))
    zip.file('OEBPS/chapter.xhtml', chapterXhtml(title, bodyXhtml))
    zip.file('OEBPS/style.css', EPUB_CSS)

    const result = await zip.generateAsync({
      type: 'uint8array',
      mimeType: 'application/epub+zip',
    })
    return result
  } catch {
    // Minimal valid epub on error
    const JSZip = (await import('jszip')).default
    const zip = new JSZip()
    zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })
    zip.file('META-INF/container.xml', containerXml())
    zip.file('OEBPS/content.opf', contentOpf(title || 'Untitled', makeUid()))
    zip.file('OEBPS/nav.xhtml', navXhtml(title || 'Untitled'))
    zip.file('OEBPS/chapter.xhtml', chapterXhtml(title || 'Untitled', '<p></p>'))
    zip.file('OEBPS/style.css', EPUB_CSS)
    return zip.generateAsync({ type: 'uint8array', mimeType: 'application/epub+zip' })
  }
}
