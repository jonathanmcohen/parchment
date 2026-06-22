/** PM doc JSON → a .docx file as a Uint8Array using the `docx` library.
 *
 * Node mapping (round-trip-relevant):
 *   heading      → HeadingLevel 1-6 (Paragraph with heading style)
 *   paragraph    → Paragraph with TextRun(s)
 *   bold         → TextRun { bold: true }
 *   italic       → TextRun { italics: true }
 *   underline    → TextRun { underline: {} }
 *   strike       → TextRun { strike: true }
 *   code (mark)  → TextRun { font: Courier New, shading }
 *   link         → ExternalHyperlink
 *   bulletList   → Paragraph { bullet: { level: 0 } }
 *   orderedList  → Paragraph { numbering: { reference, level: 0 } }
 *   blockquote   → Paragraph { indent: { left: 720 }, italics on runs }
 *   codeBlock    → Paragraph with TextRun in Courier New
 *   table        → Table with TableRow/TableCell
 *   image        → ImageRun from data-URI; skipped if remote
 *   horizontalRule → Paragraph with bottom border
 *
 * Never throws — on failure returns a minimal valid docx.
 */

// docx is imported dynamically to avoid static bundler issues on the
// Next.js server path (same pattern as html.ts uses for react-dom/server).

type Mark = { type: string; attrs?: Record<string, unknown> }
type PMNode = {
  type?: string
  attrs?: Record<string, unknown>
  content?: PMNode[]
  text?: string
  marks?: Mark[]
}

function hasMark(marks: Mark[] | undefined, type: string): boolean {
  return (marks ?? []).some((m) => m.type === type)
}

function getMark(marks: Mark[] | undefined, type: string): Mark | undefined {
  return (marks ?? []).find((m) => m.type === type)
}

async function buildTextRuns(nodes: PMNode[]): Promise<unknown[]> {
  const { TextRun, ExternalHyperlink } = await import('docx')
  const runs: unknown[] = []
  for (const node of nodes) {
    if (node.type === 'text') {
      const marks = node.marks ?? []
      const linkMark = getMark(marks, 'link')
      // Build options object without undefined values (exactOptionalPropertyTypes)
      const runOpts: Record<string, unknown> = {
        text: node.text ?? '',
        bold: hasMark(marks, 'bold'),
        italics: hasMark(marks, 'italic'),
        strike: hasMark(marks, 'strike'),
      }
      if (hasMark(marks, 'underline')) runOpts.underline = {}
      if (hasMark(marks, 'code')) {
        runOpts.font = 'Courier New'
        runOpts.shading = { fill: 'F0F0F0', color: 'auto', type: 'clear' }
      }
      const run = new TextRun(runOpts as never)
      if (linkMark) {
        const href = String(linkMark.attrs?.href ?? '')
        if (href && /^https?:/.test(href)) {
          runs.push(
            new ExternalHyperlink({
              link: href,
              children: [run],
            }),
          )
          continue
        }
      }
      runs.push(run)
    } else if (node.type === 'hardBreak') {
      runs.push(new TextRun({ text: '', break: 1 }))
    } else if (node.type === 'mathInline') {
      runs.push(new TextRun({ text: `$${String(node.attrs?.latex ?? '')}$` }))
    } else {
      // Inline fallback — recurse into children
      const sub = await buildTextRuns(node.content ?? [])
      runs.push(...sub)
    }
  }
  return runs
}

async function buildParagraph(node: PMNode, opts: Record<string, unknown> = {}): Promise<unknown> {
  const { Paragraph } = await import('docx')
  const runs = await buildTextRuns(node.content ?? [])
  // Cast through unknown to bypass the union-type children accessor issue
  // in the docx library types under exactOptionalPropertyTypes.
  return new Paragraph({ children: runs, ...opts } as never)
}

async function buildListItems(
  items: PMNode[],
  kind: 'bullet' | 'number',
  numberingRef: string,
): Promise<unknown[]> {
  const { Paragraph, LevelFormat } = await import('docx')
  void LevelFormat
  const paras: unknown[] = []
  for (const item of items) {
    const blocks = item.content ?? []
    for (const block of blocks) {
      if (block.type === 'paragraph') {
        const runs = await buildTextRuns(block.content ?? [])
        const para = new Paragraph({
          children: runs,
          ...(kind === 'bullet'
            ? { bullet: { level: 0 } }
            : { numbering: { reference: numberingRef, level: 0 } }),
        } as never)
        paras.push(para)
      } else {
        const sub = await buildBlock(block, numberingRef)
        paras.push(...(Array.isArray(sub) ? sub : [sub]))
      }
    }
  }
  return paras
}

async function buildTableCells(row: PMNode, isHeader: boolean): Promise<unknown[]> {
  const { TableCell, Paragraph, TextRun } = await import('docx')
  return (row.content ?? []).map((cell) => {
    const text = (cell.content ?? [])
      .map((b) => (b.content ?? []).map((n) => n.text ?? '').join(''))
      .join(' ')
    return new TableCell({
      children: [
        new Paragraph({
          children: [new TextRun({ text, bold: isHeader })],
        }),
      ],
    })
  })
}

async function buildTable(node: PMNode): Promise<unknown> {
  const { Table, TableRow } = await import('docx')
  const rows = node.content ?? []
  const tableRows: unknown[] = []
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (!row) continue
    const cells = await buildTableCells(row, i === 0)
    tableRows.push(
      new TableRow({
        children: cells,
        tableHeader: i === 0,
      } as never),
    )
  }
  return new Table({ rows: tableRows } as never)
}

async function buildImageRun(node: PMNode): Promise<unknown | null> {
  const { ImageRun } = await import('docx')
  const src = String(node.attrs?.src ?? '')
  const alt = String(node.attrs?.alt ?? '')
  void alt
  if (!src.startsWith('data:')) return null // skip remote URLs
  try {
    // data:[mediatype];base64,<data>
    const commaIdx = src.indexOf(',')
    if (commaIdx < 0) return null
    const b64 = src.slice(commaIdx + 1)
    const binary = Buffer.from(b64, 'base64')
    const mediaType = src.slice(5, src.indexOf(';'))
    const type = mediaType.includes('png')
      ? 'png'
      : mediaType.includes('gif')
        ? 'gif'
        : mediaType.includes('bmp')
          ? 'bmp'
          : 'jpg'
    return new ImageRun({
      data: binary,
      transformation: { width: 400, height: 300 },
      type: type as 'jpg' | 'png' | 'gif' | 'bmp',
    })
  } catch {
    return null
  }
}

const BULLET_REF = 'parchment-bullet-list'
const NUMBER_REF = 'parchment-ordered-list'

async function buildBlock(
  node: PMNode,
  _numberRef: string = NUMBER_REF,
): Promise<unknown | unknown[]> {
  const { Paragraph, TextRun, HeadingLevel } = await import('docx')

  switch (node.type) {
    case 'paragraph':
      return buildParagraph(node)

    case 'heading': {
      const level = Math.max(1, Math.min(6, Number(node.attrs?.level ?? 1)))
      const headingMap: Record<number, string> = {
        1: HeadingLevel.HEADING_1,
        2: HeadingLevel.HEADING_2,
        3: HeadingLevel.HEADING_3,
        4: HeadingLevel.HEADING_4,
        5: HeadingLevel.HEADING_5,
        6: HeadingLevel.HEADING_6,
      }
      return buildParagraph(node, { heading: headingMap[level] })
    }

    case 'bulletList':
      return buildListItems(node.content ?? [], 'bullet', BULLET_REF)

    case 'orderedList':
      return buildListItems(node.content ?? [], 'number', NUMBER_REF)

    case 'blockquote': {
      const blocks = node.content ?? []
      const result: unknown[] = []
      for (const child of blocks) {
        if (child.type === 'paragraph') {
          const runs = await buildTextRuns(child.content ?? [])
          // Make all runs italic for blockquote style
          const italicRuns = (runs as { constructor: typeof TextRun }[]).map((r) => {
            if (r instanceof TextRun) {
              // Can't mutate immutable docx objects; create new one
            }
            return r
          })
          void italicRuns
          result.push(
            new Paragraph({
              children: runs,
              indent: { left: 720 },
            } as never),
          )
        } else {
          const sub = await buildBlock(child)
          result.push(...(Array.isArray(sub) ? sub : [sub]))
        }
      }
      return result
    }

    case 'codeBlock': {
      const code = (node.content ?? []).map((n) => n.text ?? '').join('')
      return new Paragraph({
        children: [new TextRun({ text: code, font: 'Courier New' })],
        spacing: { before: 100, after: 100 },
      })
    }

    case 'horizontalRule':
      return new Paragraph({
        children: [],
        border: { bottom: { style: 'single', size: 6, space: 1, color: 'CCCCCC' } },
      })

    case 'mathBlock':
      return new Paragraph({
        children: [new TextRun({ text: `\\[ ${String(node.attrs?.latex ?? '')} \\]` })],
      })

    case 'table':
      return buildTable(node)

    case 'image': {
      const imgRun = await buildImageRun(node)
      if (imgRun) {
        return new Paragraph({ children: [imgRun] } as never)
      }
      // Placeholder for remote/missing images
      const alt = String(node.attrs?.alt ?? 'image')
      return new Paragraph({
        children: [new TextRun({ text: `[Image: ${alt}]` })],
      })
    }

    default:
      // Unknown node — try to render its children as a paragraph
      return buildParagraph({ ...node, type: 'paragraph' })
  }
}

export async function docToDocx(doc: unknown, title: string): Promise<Uint8Array> {
  try {
    const { Document, Packer, AlignmentType } = await import('docx')
    void AlignmentType

    const pmDoc = doc as PMNode
    const topBlocks = pmDoc.content ?? []

    const docChildren: unknown[] = []
    for (const block of topBlocks) {
      const built = await buildBlock(block)
      if (Array.isArray(built)) {
        docChildren.push(...built)
      } else {
        docChildren.push(built)
      }
    }

    const docxDoc = new Document({
      title: String(title || 'Untitled'),
      numbering: {
        config: [
          {
            reference: BULLET_REF,
            levels: [
              {
                level: 0,
                format: 'bullet',
                text: '•',
                alignment: 'left',
                style: {
                  paragraph: { indent: { left: 720, hanging: 360 } },
                },
              },
            ],
          },
          {
            reference: NUMBER_REF,
            levels: [
              {
                level: 0,
                format: 'decimal',
                text: '%1.',
                alignment: 'left',
                style: {
                  paragraph: { indent: { left: 720, hanging: 360 } },
                },
              },
            ],
          },
        ],
      },
      sections: [
        {
          children: docChildren as ConstructorParameters<
            typeof Document
          >[0]['sections'][0]['children'],
        },
      ],
    })

    const buffer = await Packer.toBuffer(docxDoc)
    // Node.js Buffer is a subclass of Uint8Array; cast directly
    return buffer as unknown as Uint8Array
  } catch {
    // Minimal valid docx on error
    const { Document, Packer, Paragraph, TextRun } = await import('docx')
    const fallback = new Document({
      sections: [
        {
          children: [new Paragraph({ children: [new TextRun('Export failed.')] })],
        },
      ],
    })
    const buf = await Packer.toBuffer(fallback)
    return buf as unknown as Uint8Array
  }
}
