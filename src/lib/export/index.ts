import { serializeMarkdown } from '@/lib/markdown/serialize'
import { docToStandaloneHtml } from './html'
import { docToPlainText } from './plain-text'

export type ExportFormat = 'md' | 'txt' | 'html'

export interface ExportResult {
  body: string
  contentType: string
  ext: string
}

/** Convert a doc to the requested format. Pure dispatch over serializeMarkdown /
 *  docToPlainText / docToStandaloneHtml. */
export async function exportDoc(
  doc: unknown,
  title: string,
  format: ExportFormat,
): Promise<ExportResult> {
  switch (format) {
    case 'md':
      return {
        body: serializeMarkdown(doc),
        contentType: 'text/markdown; charset=utf-8',
        ext: 'md',
      }
    case 'txt':
      return {
        body: docToPlainText(doc),
        contentType: 'text/plain; charset=utf-8',
        ext: 'txt',
      }
    case 'html':
      return {
        // async: docToStandaloneHtml dynamic-imports react-dom/server (build-safety).
        body: await docToStandaloneHtml(doc, title),
        contentType: 'text/html; charset=utf-8',
        ext: 'html',
      }
  }
}

/** Parse a raw format string → ExportFormat | null. */
export function parseExportFormat(raw: unknown): ExportFormat | null {
  if (raw === 'md' || raw === 'txt' || raw === 'html') return raw
  return null
}

/** A filesystem-safe filename from a title + ext. */
export function exportFilename(title: string, ext: string): string {
  const base =
    title
      .trim()
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 80) || 'document'
  return `${base}.${ext}`
}
