/** PM doc JSON → a standalone LaTeX document string (article class).
 *
 * Node mapping:
 *   heading      → \section / \subsection / \subsubsection / … (levels 1-6)
 *   paragraph    → plain text paragraph
 *   bold         → \textbf{…}
 *   italic       → \emph{…}
 *   code         → \texttt{…}
 *   strike       → \sout{…}  (omitted if ulem not loaded — treated as plain)
 *   underline    → \underline{…}
 *   link         → \href{url}{text}
 *   bulletList   → \begin{itemize}…\item…\end{itemize}
 *   orderedList  → \begin{enumerate}…\item…\end{enumerate}
 *   blockquote   → \begin{quote}…\end{quote}
 *   codeBlock    → \begin{verbatim}…\end{verbatim}
 *   horizontalRule → \hrule
 *   mathInline   → $…$
 *   mathBlock    → \[ … \]
 *   citation     → \cite{key}
 *   bibliography → \begin{thebibliography}{99}…\bibitem…\end{thebibliography}
 *   table        → \begin{tabular}{lll…}…\end{tabular}
 *   image        → \includegraphics{src}  (data-URIs are commented out)
 *
 * ESCAPE: LaTeX specials (& % $ # _ { } ~ ^ \) are escaped in plain text
 * runs. Math content is passed through verbatim.
 *
 * Never throws — catches all errors and returns a minimal valid document.
 */

type Mark = { type: string; attrs?: Record<string, unknown> }
type PMNode = {
  type?: string
  attrs?: Record<string, unknown>
  content?: PMNode[]
  text?: string
  marks?: Mark[]
}

const HEADING_CMDS: Record<number, string> = {
  1: '\\section',
  2: '\\subsection',
  3: '\\subsubsection',
  4: '\\paragraph',
  5: '\\subparagraph',
  6: '\\subparagraph',
}

/** Escape LaTeX special characters in a plain text string. */
function escapeTex(s: string): string {
  return s
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/&/g, '\\&')
    .replace(/%/g, '\\%')
    .replace(/\$/g, '\\$')
    .replace(/#/g, '\\#')
    .replace(/_/g, '\\_')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}')
}

function applyMark(text: string, mark: Mark): string {
  switch (mark.type) {
    case 'bold':
      return `\\textbf{${text}}`
    case 'italic':
      return `\\emph{${text}}`
    case 'code':
      return `\\texttt{${text}}`
    case 'underline':
      return `\\underline{${text}}`
    case 'strike':
      return `\\sout{${text}}`
    case 'link': {
      const href = String(mark.attrs?.href ?? '')
      // href is a raw URL — must NOT be TeX-escaped; only the display text (already done by caller) needs escaping
      return href ? `\\href{${href}}{${text}}` : text
    }
    default:
      return text
  }
}

function renderInlineText(node: PMNode): string {
  const raw = node.text ?? ''
  const marks = node.marks ?? []
  // Full escapeTex covers all LaTeX specials for both code and non-code text.
  // \texttt{} requires the same escaping as normal text — % starts a comment,
  // $ opens math mode, & misaligns, _ causes subscript errors, etc.
  let out = escapeTex(raw)
  for (const mark of marks) {
    out = applyMark(out, mark)
  }
  return out
}

function renderInlines(nodes: PMNode[] | undefined): string {
  if (!nodes) return ''
  return nodes
    .map((n) => {
      if (n.type === 'text') return renderInlineText(n)
      if (n.type === 'hardBreak') return '\\\\\n'
      if (n.type === 'mathInline') return `$${String(n.attrs?.latex ?? '')}$`
      if (n.type === 'citation') {
        const key = String(n.attrs?.citeKey ?? '')
        return key ? `\\cite{${escapeTex(key)}}` : ''
      }
      // Fallback — render children as inline
      return renderInlines(n.content)
    })
    .join('')
}

function renderListItems(items: PMNode[] | undefined, marker: 'itemize' | 'enumerate'): string {
  const lines = (items ?? []).map((item) => {
    // A listItem can have block children; render their paragraphs as inline
    const text = (item.content ?? [])
      .map((child) => {
        if (child.type === 'paragraph') return renderInlines(child.content)
        return renderBlock(child)
      })
      .join('\n')
    return `  \\item ${text}`
  })
  return [`\\begin{${marker}}`, ...lines, `\\end{${marker}}`].join('\n')
}

function renderTableRow(row: PMNode, isHeader: boolean): string {
  const cells = (row.content ?? [])
    .map((cell) => {
      const text = (cell.content ?? []).map((b) => renderInlines(b.content)).join(' ')
      return isHeader ? `\\textbf{${text}}` : text
    })
    .join(' & ')
  return `${cells} \\\\`
}

function renderTable(node: PMNode): string {
  const rows = node.content ?? []
  const colCount = Math.max(1, rows[0]?.content?.length ?? 1)
  const colSpec = Array(colCount).fill('l').join('|')
  const lines = [`\\begin{tabular}{|${colSpec}|}`, '\\hline']
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (!row) continue
    lines.push(renderTableRow(row, i === 0))
    lines.push('\\hline')
  }
  lines.push('\\end{tabular}')
  return lines.join('\n')
}

function renderBibliography(node: PMNode): string {
  const refs = Array.isArray(node.attrs?.refs) ? (node.attrs.refs as Record<string, unknown>[]) : []
  const items = refs
    .map((ref) => {
      const key = String(ref.id ?? ref.citeKey ?? '')
      const author = String(ref.author ?? '')
      const year = String(ref.year ?? '')
      const title = String(ref.title ?? '')
      const journal = String(ref.journal ?? ref.publisher ?? '')
      const label = [author, year, title, journal].filter(Boolean).join('. ')
      return `  \\bibitem{${escapeTex(key)}} ${escapeTex(label)}.`
    })
    .join('\n')
  return [`\\begin{thebibliography}{99}`, items, `\\end{thebibliography}`].join('\n')
}

function renderBlock(node: PMNode): string {
  switch (node.type) {
    case 'paragraph':
      return renderInlines(node.content)
    case 'heading': {
      const level = Math.max(1, Math.min(6, Number(node.attrs?.level ?? 1)))
      const cmd = HEADING_CMDS[level] ?? '\\paragraph'
      return `${cmd}{${renderInlines(node.content)}}`
    }
    case 'bulletList':
      return renderListItems(node.content, 'itemize')
    case 'orderedList':
      return renderListItems(node.content, 'enumerate')
    case 'listItem': {
      const text = (node.content ?? []).map((c) => renderInlines(c.content)).join('\n')
      return `\\item ${text}`
    }
    case 'blockquote':
      return [
        '\\begin{quote}',
        (node.content ?? []).map(renderBlock).join('\n\n'),
        '\\end{quote}',
      ].join('\n')
    case 'codeBlock': {
      const code = (node.content ?? []).map((n) => n.text ?? '').join('')
      // The verbatim environment terminates at the first literal \end{verbatim}.
      // Split on that sequence and re-open the environment to prevent early
      // termination and LaTeX injection from content containing that string.
      const VERBATIM_END = '\\end{verbatim}'
      const parts = code.split(VERBATIM_END)
      if (parts.length === 1) {
        return `\\begin{verbatim}\n${code}\n\\end{verbatim}`
      }
      return parts
        .map(
          (part, i) =>
            `\\begin{verbatim}\n${part}${i < parts.length - 1 ? '\n% [\\end{verbatim} in source omitted]\n' : '\n'}\\end{verbatim}`,
        )
        .join('')
    }
    case 'horizontalRule':
      return '\\hrule'
    case 'mathBlock':
      return `\\[\n${String(node.attrs?.latex ?? '')}\n\\]`
    case 'table':
      return renderTable(node)
    case 'image': {
      const src = String(node.attrs?.src ?? '')
      const alt = String(node.attrs?.alt ?? '')
      if (src.startsWith('data:')) {
        // Data URI — cannot be embedded in LaTeX directly; emit a comment
        return `% \\includegraphics{image} % data-URI image omitted (alt: ${escapeTex(alt)})`
      }
      if (src) {
        return `\\includegraphics{${escapeTex(src)}}`
      }
      return `% image omitted (alt: ${escapeTex(alt)})`
    }
    case 'bibliography':
      return renderBibliography(node)
    default:
      // Unknown block — render children as inlines (degrade gracefully)
      return renderInlines(node.content)
  }
}

function renderDoc(doc: PMNode): string {
  return (doc.content ?? []).map(renderBlock).join('\n\n')
}

export function docToLatex(doc: unknown, title: string): string {
  try {
    const safeTitle = escapeTex(String(title || 'Untitled'))
    const body = renderDoc(doc as PMNode)
    return [
      '\\documentclass{article}',
      '\\usepackage{amsmath, graphicx, hyperref}',
      '\\usepackage[normalem]{ulem}',
      `\\title{${safeTitle}}`,
      '\\date{}',
      '\\begin{document}',
      '\\maketitle',
      '',
      body,
      '',
      '\\end{document}',
    ].join('\n')
  } catch {
    return [
      '\\documentclass{article}',
      '\\usepackage{amsmath, graphicx, hyperref}',
      '\\usepackage[normalem]{ulem}',
      '\\title{Document}',
      '\\date{}',
      '\\begin{document}',
      '\\maketitle',
      '\\end{document}',
    ].join('\n')
  }
}
