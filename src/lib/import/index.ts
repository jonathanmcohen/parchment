// H9: Import — convert an uploaded file into ProseMirror JSON via the
// everything→Markdown→markdownToJson strategy.
//
// SERVER-ONLY: mammoth, turndown, jsdom are Node-only libs. They must NEVER
// appear in the client bundle or the edge runtime. This module is only ever
// imported by the /api/docs/import route (which declares runtime='nodejs').
// Dynamic imports are used inside the conversion functions so Turbopack's
// static analysis cannot pull them into a client chunk.
//
// NEVER throws — malformed input → partial result + warnings array.

import { markdownToJson } from '@/lib/markdown/parse'

export type ImportType = 'md' | 'docx' | 'html' | 'notion-zip' | 'unknown'

export interface ImportResult {
  json: Record<string, unknown>
  title: string
  warnings: string[]
}

// J7-1: the user-facing import flow is LOCKED to markdown + docx only. The lib
// still understands html / notion-zip (kept intact behind this flag so the
// conversion code paths and their tests remain), but the /api/docs/import route
// gates on `isUserImportType` and answers 415 for everything else.
const USER_IMPORT_TYPES: ReadonlySet<ImportType> = new Set<ImportType>(['md', 'docx'])

/** True when an ImportType is permitted in the user-facing import flow (md+docx). */
export function isUserImportType(type: ImportType): boolean {
  return USER_IMPORT_TYPES.has(type)
}

/**
 * J7-4: persist callback used to extract embedded (data-URI) images during import.
 * Returns the rewritten `src` URL (e.g. `/api/docs/<id>/assets/<file>`) on success,
 * or `null` to keep the original data URI. Best-effort — the route supplies a
 * closure over the J1 upload store + the freshly created doc id.
 */
export type PersistImage = (bytes: Uint8Array, mime: string) => Promise<string | null>

// Matches a markdown image whose URL is a base64 data URI: ![alt](data:<mime>;base64,<payload>)
// The alt text and the trailing `)` are preserved; only the URL is rewritten.
const DATA_URI_IMAGE_RE = /!\[([^\]]*)\]\(\s*(data:([^;]+);base64,([^)\s]+))\s*\)/g

/** Decode a base64 string to bytes without relying on a DOM atob. NEVER throws. */
function base64ToBytes(b64: string): Uint8Array | null {
  try {
    return new Uint8Array(Buffer.from(b64, 'base64'))
  } catch {
    return null
  }
}

/**
 * J7-4: rewrite every base64 data-URI image in `md` by persisting its bytes via
 * `persist` and swapping the `src` for the returned URL. On any failure (decode or
 * persist) the original data URI is kept and a warning is pushed. NEVER throws.
 */
export async function rewriteDataUriImages(
  md: string,
  warnings: string[],
  persist: PersistImage,
): Promise<string> {
  // Collect matches first (regex.exec with the global flag + async work don't mix).
  const matches = [...md.matchAll(DATA_URI_IMAGE_RE)]
  if (matches.length === 0) return md

  // Map each full data-URI token → its replacement URL (or keep on failure).
  const replacements = new Map<string, string>()
  for (const m of matches) {
    const fullDataUri = m[2]
    const mime = m[3]
    const payload = m[4]
    if (!fullDataUri || !mime || !payload || replacements.has(fullDataUri)) continue
    const bytes = base64ToBytes(payload)
    if (!bytes) {
      warnings.push('Skipped an embedded image: could not decode base64 payload.')
      continue
    }
    let url: string | null = null
    try {
      url = await persist(bytes, mime)
    } catch {
      url = null
    }
    if (url) {
      replacements.set(fullDataUri, url)
    } else {
      warnings.push('Kept an embedded image inline: failed to extract it to asset storage.')
    }
  }

  if (replacements.size === 0) return md
  return md.replace(DATA_URI_IMAGE_RE, (full, alt: string, dataUri: string) => {
    const url = replacements.get(dataUri)
    return url ? `![${alt}](${url})` : full
  })
}

// PK = Zip magic bytes (0x50 0x4B 0x03 0x04)
const PK_MAGIC = [0x50, 0x4b, 0x03, 0x04]

function isPkZip(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === PK_MAGIC[0] &&
    bytes[1] === PK_MAGIC[1] &&
    bytes[2] === PK_MAGIC[2] &&
    bytes[3] === PK_MAGIC[3]
  )
}

/**
 * Detect the import type from filename + the first bytes.
 * - .md / .markdown → 'md'
 * - .html / .htm → 'html'
 * - .docx → 'docx'
 * - .zip (PK magic) that is a Notion export (contains .md files) → 'notion-zip'
 * - .zip with PK magic that looks like a docx → 'docx'
 * - else → 'unknown'
 */
export function detectImportType(filename: string, bytes: Uint8Array): ImportType {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'md'
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'html'
  if (lower.endsWith('.docx')) return 'docx'
  if (lower.endsWith('.zip') && isPkZip(bytes)) return 'notion-zip'
  // A bare PK zip that masquerades as a docx (no extension) — treat as docx
  // if it has the magic bytes. We rely on the route's mime/extension check for
  // the true unknown case.
  return 'unknown'
}

/**
 * Extract a title from markdown: use the first `# H1` text if present,
 * otherwise fall back to the filename (sans extension).
 */
function titleFromMd(md: string, filename: string): string {
  const h1 = /^#\s+(.+)$/m.exec(md)
  if (h1?.[1]) return h1[1].trim()
  return filenameWithoutExtension(filename)
}

function filenameWithoutExtension(filename: string): string {
  const base = filename.split('/').pop() ?? filename
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(0, dot) : base
}

/**
 * Convert HTML → Markdown using turndown + a jsdom DOM.
 * Dynamic imports keep these Node-only modules out of the client/edge bundle.
 * Pure-ish (no fetch). NEVER throws — on failure returns the raw html as-is.
 */
export async function htmlToMarkdown(html: string): Promise<string> {
  try {
    const { JSDOM } = await import('jsdom')
    const { default: TurndownService } = await import('turndown')
    const dom = new JSDOM(html)
    const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' })
    return td.turndown(dom.window.document.body)
  } catch {
    // Return raw HTML as a fallback — markdownToJson will preserve it as text
    return html
  }
}

// Maximum total uncompressed bytes we'll accept from a ZIP before aborting.
// Prevents zip-bomb attacks: a ≤25 MB compressed ZIP cannot expand beyond this.
const MAX_UNCOMPRESSED_TOTAL = 100 * 1024 * 1024 // 100 MB
// Maximum uncompressed size for the single entry we actually decompress.
const MAX_UNCOMPRESSED_ENTRY = 50 * 1024 * 1024 // 50 MB

/**
 * Return the basename of a ZIP entry name and reject any entry that contains
 * path-traversal sequences or absolute paths. Returns null for unsafe entries.
 */
function safeEntryBasename(name: string): string | null {
  // Reject absolute paths and any component that is or contains '..'
  if (name.startsWith('/') || name.startsWith('\\')) return null
  const parts = name.split(/[/\\]/)
  if (parts.some((p) => p === '..' || p === '.')) return null
  return parts[parts.length - 1] ?? null
}

/**
 * Unzip a Notion export ZIP and return the primary markdown text.
 * Notion exports are ZIPs of .md files (one per page). We pick:
 *   1. The largest .md file (heuristic: the root page).
 *   2. Fallback: the largest .html file.
 * Returns { text, ext } — ext is 'md' or 'html'.
 *
 * Safety guards:
 * - Total uncompressed size across all entries must not exceed MAX_UNCOMPRESSED_TOTAL.
 * - The chosen entry's uncompressed size must not exceed MAX_UNCOMPRESSED_ENTRY.
 * - Entry names with path-traversal sequences are silently skipped.
 */
async function unpackNotionZip(
  bytes: Uint8Array,
): Promise<{ text: string; ext: 'md' | 'html' } | null> {
  try {
    const { default: JSZip } = await import('jszip')
    const zip = await JSZip.loadAsync(bytes)
    let bestMd: { name: string; size: number } | null = null
    let bestHtml: { name: string; size: number } | null = null
    let totalUncompressed = 0

    for (const [name, entry] of Object.entries(zip.files)) {
      if (entry.dir) continue

      // Path-traversal guard: skip unsafe entry names
      if (safeEntryBasename(name) === null) continue

      const size =
        (entry as unknown as { _data: { uncompressedSize: number } })._data?.uncompressedSize ?? 0

      // Zip-bomb guard: abort if total uncompressed size exceeds threshold
      totalUncompressed += size
      if (totalUncompressed > MAX_UNCOMPRESSED_TOTAL) return null

      const low = name.toLowerCase()
      if (low.endsWith('.md') || low.endsWith('.markdown')) {
        if (!bestMd || size > bestMd.size) bestMd = { name, size }
      } else if (low.endsWith('.html') || low.endsWith('.htm')) {
        if (!bestHtml || size > bestHtml.size) bestHtml = { name, size }
      }
    }

    if (bestMd) {
      // Per-entry size guard before decompression
      if (bestMd.size > MAX_UNCOMPRESSED_ENTRY) return null
      const text = await zip.files[bestMd.name]?.async('string')
      if (text !== undefined) return { text, ext: 'md' }
    }
    if (bestHtml) {
      // Per-entry size guard before decompression
      if (bestHtml.size > MAX_UNCOMPRESSED_ENTRY) return null
      const text = await zip.files[bestHtml.name]?.async('string')
      if (text !== undefined) return { text, ext: 'html' }
    }
    return null
  } catch {
    return null
  }
}

/**
 * Convert an uploaded file to ProseMirror JSON.
 * Dispatch per type using the everything→Markdown→markdownToJson strategy.
 * Each conversion is wrapped in try/catch; on failure a warning is pushed
 * and a partial / empty result is returned. NEVER throws.
 */
export async function importToPmJson(
  type: ImportType,
  bytes: Uint8Array,
  filename: string,
  opts?: { persistImage?: PersistImage },
): Promise<ImportResult> {
  const warnings: string[] = []
  const fallback: ImportResult = {
    json: markdownToJson(''),
    title: filenameWithoutExtension(filename),
    warnings,
  }

  if (type === 'unknown') {
    warnings.push('Unknown file type — imported as empty document.')
    return fallback
  }

  if (type === 'md') {
    try {
      const md = new TextDecoder().decode(bytes)
      const json = markdownToJson(md)
      return { json, title: titleFromMd(md, filename), warnings }
    } catch (err) {
      warnings.push(`Markdown parse failed: ${String(err)}`)
      return fallback
    }
  }

  if (type === 'html') {
    try {
      const html = new TextDecoder().decode(bytes)
      let md: string
      try {
        md = await htmlToMarkdown(html)
      } catch (err) {
        warnings.push(`HTML→Markdown conversion failed: ${String(err)}`)
        md = ''
      }
      const json = markdownToJson(md)
      return { json, title: titleFromMd(md, filename), warnings }
    } catch (err) {
      warnings.push(`HTML import failed: ${String(err)}`)
      return fallback
    }
  }

  if (type === 'docx') {
    try {
      const { convertToHtml } = await import('mammoth')
      let html = ''
      try {
        const result = await convertToHtml({ buffer: Buffer.from(bytes) })
        html = result.value
        for (const msg of result.messages) {
          if (msg.type === 'warning') warnings.push(`docx: ${msg.message}`)
        }
      } catch (err) {
        warnings.push(`docx conversion failed: ${String(err)}`)
      }
      let md = ''
      if (html) {
        try {
          md = await htmlToMarkdown(html)
        } catch (err) {
          warnings.push(`docx HTML→Markdown failed: ${String(err)}`)
        }
      }
      // J7-4: mammoth emits embedded images as base64 data URIs; extract them to
      // asset storage so the imported doc doesn't carry megabytes of base64. The
      // caller (the route) supplies a persist closure bound to the new doc id.
      // Best-effort — on failure the data URI is kept (rewriteDataUriImages warns).
      if (md && opts?.persistImage) {
        md = await rewriteDataUriImages(md, warnings, opts.persistImage)
      }
      const json = markdownToJson(md)
      return { json, title: titleFromMd(md, filename), warnings }
    } catch (err) {
      warnings.push(`docx import failed: ${String(err)}`)
      return fallback
    }
  }

  if (type === 'notion-zip') {
    try {
      const unpacked = await unpackNotionZip(bytes)
      if (!unpacked) {
        warnings.push('Notion ZIP contained no .md or .html files — imported as empty document.')
        return fallback
      }
      const { text, ext } = unpacked
      let md: string
      if (ext === 'md') {
        md = text
      } else {
        try {
          md = await htmlToMarkdown(text)
        } catch (err) {
          warnings.push(`Notion HTML→Markdown failed: ${String(err)}`)
          md = ''
        }
      }
      const json = markdownToJson(md)
      return { json, title: titleFromMd(md, filename), warnings }
    } catch (err) {
      warnings.push(`Notion ZIP import failed: ${String(err)}`)
      return fallback
    }
  }

  // Unreachable — exhaustive guard
  warnings.push(`Unhandled import type: ${String(type)}`)
  return fallback
}
