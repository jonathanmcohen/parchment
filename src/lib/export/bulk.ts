import JSZip from 'jszip'
import { type ExportFormat, exportDoc, exportFilename } from './index'

export interface BulkDocInput {
  id: string
  title: string
  content: unknown
}

/**
 * Build a ZIP (Uint8Array) of the given docs each exported in `format`.
 * Filenames are made unique (append -2, -3 … on collision).
 * Skips a doc whose export throws. Never throws. Returns the zip bytes.
 */
export async function buildBulkZip(
  docs: BulkDocInput[],
  format: ExportFormat,
): Promise<Uint8Array> {
  const zip = new JSZip()
  const usedNames = new Set<string>()

  for (const doc of docs) {
    try {
      const { body, ext } = await exportDoc(
        doc.content ?? { type: 'doc', content: [] },
        doc.title,
        format,
      )
      const name = uniqueName(exportFilename(doc.title, ext), usedNames)
      zip.file(name, body)
    } catch {
      // skip this doc on failure
    }
  }

  return zip.generateAsync({ type: 'uint8array' })
}

/**
 * Return a filename that is not already in `used`, appending -2, -3 … as needed.
 * Mutates `used` by adding the chosen name.
 */
function uniqueName(base: string, used: Set<string>): string {
  if (!used.has(base)) {
    used.add(base)
    return base
  }
  // Split off extension
  const dotIdx = base.lastIndexOf('.')
  const stem = dotIdx >= 0 ? base.slice(0, dotIdx) : base
  const ext = dotIdx >= 0 ? base.slice(dotIdx) : ''
  let counter = 2
  while (true) {
    const candidate = `${stem}-${counter}${ext}`
    if (!used.has(candidate)) {
      used.add(candidate)
      return candidate
    }
    counter++
  }
}
