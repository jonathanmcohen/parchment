// J1-1: pure upload validator. NO fs, NO db, NO React — unit-testable in isolation.
//
// Trust model: NEVER trust the client-supplied `file.type` or filename alone. For
// every binary image/pdf type we re-derive the true type from the leading bytes
// (magic-byte sniff) and reject a mismatch (content_mismatch) — this defeats a
// `payload.php` renamed `x.png`, a polyglot, or a spoofed Content-Type. SVG is text
// (no magic bytes) so we instead scan it for active content (`<script>`, `on*=`,
// `javascript:` etc.) and reject (unsafe_svg) — an inline-served SVG with a script
// is stored-XSS. Text types (txt/csv) are sniff-exempt (no reliable signature) and
// accepted by declared type only; they are served as attachments downstream.

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024 // 10 MB (parity with the old image cap)
export const MAX_FILE_BYTES = 25 * 1024 * 1024 // 25 MB (non-image attachments)

export type UploadKind = 'image' | 'file'

export type UploadError =
  | 'unsupported_type'
  | 'content_mismatch'
  | 'unsafe_svg'
  | 'too_large'
  | 'empty'

export type ClassifyResult =
  | { ok: true; kind: UploadKind; ext: string; contentType: string }
  | { ok: false; error: UploadError }

// Allow-list: declared mime → { kind, ext, sniff }. `sniff` is the content-type the
// magic-byte sniffer MUST report for binary types; SVG/text are sniff-exempt.
interface AllowEntry {
  kind: UploadKind
  ext: string
  // The content type sniffMagic must return, or 'svg'/'text' for the special paths.
  sniff:
    | 'image/png'
    | 'image/jpeg'
    | 'image/gif'
    | 'image/webp'
    | 'application/pdf'
    | 'svg'
    | 'text'
}

const ALLOW: Record<string, AllowEntry> = {
  'image/png': { kind: 'image', ext: 'png', sniff: 'image/png' },
  'image/jpeg': { kind: 'image', ext: 'jpg', sniff: 'image/jpeg' },
  'image/gif': { kind: 'image', ext: 'gif', sniff: 'image/gif' },
  'image/webp': { kind: 'image', ext: 'webp', sniff: 'image/webp' },
  'image/svg+xml': { kind: 'image', ext: 'svg', sniff: 'svg' },
  'application/pdf': { kind: 'file', ext: 'pdf', sniff: 'application/pdf' },
  'text/plain': { kind: 'file', ext: 'txt', sniff: 'text' },
  'text/csv': { kind: 'file', ext: 'csv', sniff: 'text' },
  'text/markdown': { kind: 'file', ext: 'md', sniff: 'text' },
  'application/json': { kind: 'file', ext: 'json', sniff: 'text' },
  // Common office documents (no cheap content sniff beyond the zip/CDFV2 envelope —
  // accepted by declared type; they are served as attachments, never inline).
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
    kind: 'file',
    ext: 'docx',
    sniff: 'text',
  },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
    kind: 'file',
    ext: 'xlsx',
    sniff: 'text',
  },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': {
    kind: 'file',
    ext: 'pptx',
    sniff: 'text',
  },
}

/** Sniffable binary content type from leading bytes, or null if unrecognized. */
export function sniffMagic(bytes: Uint8Array): string | null {
  const b = bytes
  const at = (i: number) => b[i]
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    b.length >= 8 &&
    at(0) === 0x89 &&
    at(1) === 0x50 &&
    at(2) === 0x4e &&
    at(3) === 0x47 &&
    at(4) === 0x0d &&
    at(5) === 0x0a &&
    at(6) === 0x1a &&
    at(7) === 0x0a
  ) {
    return 'image/png'
  }
  // JPEG: FF D8 FF
  if (b.length >= 3 && at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return 'image/jpeg'
  // GIF: "GIF87a" / "GIF89a"
  if (
    b.length >= 6 &&
    at(0) === 0x47 &&
    at(1) === 0x49 &&
    at(2) === 0x46 &&
    at(3) === 0x38 &&
    (at(4) === 0x37 || at(4) === 0x39) &&
    at(5) === 0x61
  ) {
    return 'image/gif'
  }
  // WEBP: "RIFF"...."WEBP"
  if (
    b.length >= 12 &&
    at(0) === 0x52 &&
    at(1) === 0x49 &&
    at(2) === 0x46 &&
    at(3) === 0x46 &&
    at(8) === 0x57 &&
    at(9) === 0x45 &&
    at(10) === 0x42 &&
    at(11) === 0x50
  ) {
    return 'image/webp'
  }
  // PDF: "%PDF-"
  if (
    b.length >= 5 &&
    at(0) === 0x25 &&
    at(1) === 0x50 &&
    at(2) === 0x44 &&
    at(3) === 0x46 &&
    at(4) === 0x2d
  ) {
    return 'application/pdf'
  }
  return null
}

// Reject any SVG carrying active content: <script>, event handlers (on*=),
// javascript:/data: URLs, <foreignObject>, or external <use>/href. Case-insensitive.
const SVG_ACTIVE = [
  /<script[\s>]/i,
  /<\s*foreignObject/i,
  /\son\w+\s*=/i, // onload=, onclick=, …
  /javascript:/i,
  /<!ENTITY/i, // XXE / billion-laughs entity decls
  /xlink:href\s*=\s*["']?\s*(?:https?:|data:|javascript:)/i,
  /\shref\s*=\s*["']?\s*(?:https?:|data:|javascript:)/i,
]

/** True when the SVG text contains active/script content (=> reject). */
export function svgHasActiveContent(svg: string): boolean {
  return SVG_ACTIVE.some((re) => re.test(svg))
}

/**
 * Classify an upload from its declared metadata + raw bytes.
 * Order of checks: empty → declared-type allow-list → size cap → (svg active scan |
 * text exempt | magic-byte match). Returns a discriminated result.
 */
export function classifyUpload(
  meta: { name: string; type: string; size: number },
  bytes: Uint8Array,
): ClassifyResult {
  if (meta.size <= 0 || bytes.length === 0) return { ok: false, error: 'empty' }

  const entry = ALLOW[meta.type.toLowerCase().trim()]
  if (!entry) return { ok: false, error: 'unsupported_type' }

  const cap = entry.kind === 'image' ? MAX_IMAGE_BYTES : MAX_FILE_BYTES
  if (meta.size > cap) return { ok: false, error: 'too_large' }

  if (entry.sniff === 'svg') {
    const text = new TextDecoder().decode(bytes)
    if (svgHasActiveContent(text)) return { ok: false, error: 'unsafe_svg' }
    return { ok: true, kind: entry.kind, ext: entry.ext, contentType: 'image/svg+xml' }
  }

  if (entry.sniff === 'text') {
    // No reliable content signature; accept by declared type. Served as attachment.
    return { ok: true, kind: entry.kind, ext: entry.ext, contentType: meta.type }
  }

  // Binary type: the leading bytes MUST match the declared type exactly.
  const sniffed = sniffMagic(bytes)
  if (sniffed !== entry.sniff) return { ok: false, error: 'content_mismatch' }
  return { ok: true, kind: entry.kind, ext: entry.ext, contentType: entry.sniff }
}

/** The set of declared mime types the upload route advertises as accepted. */
export const ALLOWED_UPLOAD_TYPES = Object.freeze(Object.keys(ALLOW))

// J7-4: image content-types a docx may embed → a safe file extension. Used by the
// import route to name extracted assets. Returns null for any mime we don't store
// as an image (the caller then keeps the original data URI). Distinct from ALLOW
// (the upload allow-list) because docx can legitimately carry e.g. bmp/tiff that we
// still want to persist on import; on the upload route those stay rejected.
const IMAGE_EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/bmp': 'bmp',
  'image/tiff': 'tiff',
  'image/x-emf': 'emf',
  'image/svg+xml': 'svg',
}

/** Safe lowercase file extension for an embedded-image mime, or null if unknown. */
export function extForMime(mime: string): string | null {
  return IMAGE_EXT_BY_MIME[mime.trim().toLowerCase()] ?? null
}
