/**
 * F5 — Edit-menu clipboard helpers.
 *
 * PURE module: no Tiptap/ProseMirror/DOM imports, so it runs in the Node test
 * environment and stays off the getSchema server path. The Editor wiring imports
 * `plainTextToContent` to feed `editor.chain().insertContent(...)`.
 */

/** A ProseMirror JSON node fragment understood by Tiptap's insertContent. */
export type PlainTextNode =
  | { type: 'text'; text: string }
  | { type: 'hardBreak' }
  | { type: 'paragraph'; content?: PlainTextNode[] }

/**
 * Convert raw clipboard *text* into a ProseMirror content array with all
 * formatting stripped — every text node is bare (no marks). Blank-line-separated
 * blocks become separate paragraphs; single newlines inside a block become
 * hardBreak nodes. Whitespace-only / empty input yields an empty array (the
 * caller then inserts nothing).
 *
 * This is the backing logic for "Paste without formatting": because the input is
 * already plain text and we emit only `text`/`hardBreak`/`paragraph` nodes with
 * no marks, the result can carry no bold/italic/colour/etc.
 */
export function plainTextToContent(raw: string): PlainTextNode[] {
  if (raw.trim().length === 0) return []

  // Normalize line endings, then split into blocks on runs of blank lines.
  const normalized = raw.replace(/\r\n?/g, '\n')
  const blocks = normalized.split(/\n[ \t]*\n+/)

  const paragraphs: PlainTextNode[] = []
  for (const block of blocks) {
    if (block.trim().length === 0) continue

    const lines = block.split('\n')
    const content: PlainTextNode[] = []
    lines.forEach((line, i) => {
      if (i > 0) content.push({ type: 'hardBreak' })
      if (line.length > 0) content.push({ type: 'text', text: line })
    })
    if (content.length === 0) continue

    paragraphs.push({ type: 'paragraph', content })
  }

  return paragraphs
}
