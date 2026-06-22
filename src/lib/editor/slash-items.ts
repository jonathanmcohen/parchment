export type SlashCategory = 'BASIC' | 'TEXT' | 'LISTS' | 'MEDIA' | 'EMBED' | 'ADVANCED'

export interface SlashItem {
  id: string
  title: string
  category: SlashCategory
  keywords: string[]
}

export const SLASH_CATEGORIES: SlashCategory[] = [
  'BASIC',
  'TEXT',
  'LISTS',
  'MEDIA',
  'EMBED',
  'ADVANCED',
]

/** The command catalog — metadata only, no editor references. */
export const SLASH_ITEMS: SlashItem[] = [
  // ── BASIC ────────────────────────────────────────────────────────────────
  {
    id: 'paragraph',
    title: 'Text',
    category: 'BASIC',
    keywords: ['paragraph', 'text', 'plain', 'body'],
  },
  {
    id: 'heading1',
    title: 'Heading 1',
    category: 'BASIC',
    keywords: ['h1', 'heading', 'title', 'head'],
  },
  {
    id: 'heading2',
    title: 'Heading 2',
    category: 'BASIC',
    keywords: ['h2', 'heading', 'subtitle', 'head'],
  },
  {
    id: 'heading3',
    title: 'Heading 3',
    category: 'BASIC',
    keywords: ['h3', 'heading', 'section', 'head'],
  },
  {
    id: 'horizontalRule',
    title: 'Divider',
    category: 'BASIC',
    keywords: ['hr', 'divider', 'separator', 'rule', 'line'],
  },

  // ── TEXT ─────────────────────────────────────────────────────────────────
  {
    id: 'blockquote',
    title: 'Quote',
    category: 'TEXT',
    keywords: ['blockquote', 'quote', 'citation', 'callout'],
  },
  {
    id: 'codeBlock',
    title: 'Code block',
    category: 'TEXT',
    keywords: ['code', 'codeblock', 'snippet', 'pre', 'monospace'],
  },

  // ── LISTS ────────────────────────────────────────────────────────────────
  {
    id: 'bulletList',
    title: 'Bulleted list',
    category: 'LISTS',
    keywords: ['ul', 'bullet', 'list', 'unordered'],
  },
  {
    id: 'orderedList',
    title: 'Numbered list',
    category: 'LISTS',
    keywords: ['ol', 'numbered', 'ordered', 'list', 'number'],
  },
  {
    id: 'taskList',
    title: 'Task list',
    category: 'LISTS',
    keywords: ['task', 'checklist', 'todo', 'checkbox'],
  },

  // ── MEDIA ────────────────────────────────────────────────────────────────
  {
    id: 'image',
    title: 'Image',
    category: 'MEDIA',
    keywords: ['image', 'photo', 'picture', 'img', 'upload'],
  },
  {
    id: 'table',
    title: 'Table',
    category: 'MEDIA',
    keywords: ['table', 'grid', 'spreadsheet', 'tab'],
  },
  // G5: Excalidraw drawing embed.
  {
    id: 'drawing',
    title: 'Drawing',
    category: 'MEDIA',
    keywords: ['drawing', 'sketch', 'excalidraw', 'diagram', 'whiteboard', 'canvas', 'draw'],
  },
  // G6a: Mermaid diagram embed.
  {
    id: 'mermaid',
    title: 'Mermaid',
    category: 'MEDIA',
    keywords: ['mermaid', 'diagram', 'flowchart', 'sequence', 'gantt'],
  },
  // G6b: PlantUML diagram embed.
  {
    id: 'plantuml',
    title: 'PlantUML',
    category: 'MEDIA',
    keywords: ['plantuml', 'uml', 'diagram', 'sequence', 'class', 'component'],
  },
  // G6c: Drawio diagram embed.
  {
    id: 'drawio',
    title: 'Drawio',
    category: 'MEDIA',
    keywords: ['drawio', 'diagrams.net', 'diagram', 'flowchart', 'uml', 'draw', 'embed'],
  },

  // ── EMBED ────────────────────────────────────────────────────────────────
  {
    id: 'toc',
    title: 'Table of contents',
    category: 'EMBED',
    keywords: ['toc', 'contents', 'outline', 'index', 'navigation'],
  },

  // ── ADVANCED ─────────────────────────────────────────────────────────────
  {
    id: 'footnote',
    title: 'Footnote',
    category: 'ADVANCED',
    keywords: ['footnote', 'endnote', 'reference', 'note', 'fn'],
  },
  // B13: page break + section break
  {
    id: 'pageBreak',
    title: 'Page break',
    category: 'ADVANCED',
    keywords: ['page', 'break', 'pagebreak', 'newpage'],
  },
  {
    id: 'sectionBreak',
    title: 'Section break',
    category: 'ADVANCED',
    keywords: ['section', 'break', 'sectionbreak', 'chapter'],
  },
  // G7b: bibliography block — inserts the reference list block.
  {
    id: 'bibliography',
    title: 'Bibliography',
    category: 'ADVANCED',
    keywords: ['bibliography', 'references', 'citations', 'works cited', 'reference list'],
  },
  // G4: KaTeX equations.
  {
    id: 'mathBlock',
    title: 'Equation',
    category: 'ADVANCED',
    keywords: ['equation', 'math', 'katex', 'latex', 'formula', 'display', 'block'],
  },
  {
    id: 'mathInline',
    title: 'Inline equation',
    category: 'ADVANCED',
    keywords: ['inline', 'equation', 'math', 'katex', 'latex', 'formula'],
  },
  {
    id: 'equationRef',
    title: 'Equation reference',
    category: 'ADVANCED',
    keywords: ['equation', 'reference', 'ref', 'eqref', 'cite', 'math'],
  },
  // G8b: cross-reference — insert an inline [→target] node that auto-resolves
  // its label (Figure N / Table N / Section N / Equation N) via the numbering plugin.
  {
    id: 'crossRef',
    title: 'Cross-reference',
    category: 'ADVANCED',
    keywords: [
      'ref',
      'figure',
      'table',
      'equation',
      'section',
      'cross-reference',
      'crossref',
      'reference',
    ],
  },
  // G16: Speaker note — author-only block, hidden from reading/share view.
  {
    id: 'speakerNote',
    title: 'Speaker note',
    category: 'ADVANCED',
    keywords: ['speaker', 'note', 'presenter', 'notes', 'private'],
  },
]

/**
 * Filter SLASH_ITEMS by title or keywords (case-insensitive).
 * An empty query returns all items.
 */
export function filterSlashItems(query: string): SlashItem[] {
  if (!query) return SLASH_ITEMS
  const q = query.toLowerCase()
  return SLASH_ITEMS.filter(
    (item) =>
      item.title.toLowerCase().includes(q) ||
      item.keywords.some((kw) => kw.toLowerCase().includes(q)),
  )
}
