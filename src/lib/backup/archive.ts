// I4 — Workspace backup archive (pure-ish; jszip only, NO @/db).
//
// LOSSLESS by design: each doc's raw ProseMirror JSON is stored verbatim as
// `docs/<id>.json` (JSON.stringify(content)) so diagrams / math / citations
// survive a build→parse round-trip byte-for-byte. The optional `.md` copy is a
// human-readable convenience that is NEVER read back on restore.
//
// The restore path reuses the H9 import zip guards (total/entry uncompressed
// size caps + a path-traversal-safe entry name check) unchanged — they must not
// be weakened here.

import JSZip from 'jszip'
import { exportFilename } from '@/lib/export/index'
import { serializeMarkdown } from '@/lib/markdown/serialize'

/** Bump when the on-disk layout changes in a backwards-incompatible way. */
export const BACKUP_FORMAT_VERSION = 1

/** One manifest entry per backed-up doc. `file` points at the lossless JSON. */
export interface BackupManifestDoc {
  id: string
  title: string
  folderId: string | null
  file: string
}

export interface BackupManifest {
  version: number
  createdAt: string
  docCount: number
  docs: BackupManifestDoc[]
}

/** Input shape for a single doc to back up (raw PM JSON in `content`). */
export interface BackupDocInput {
  id: string
  title: string
  folderId: string | null
  content: unknown
}

/** A parsed entry: its manifest metadata plus the raw PM JSON content. */
export interface ParsedBackupEntry {
  meta: BackupManifestDoc
  content: unknown
}

export interface ParsedBackup {
  manifest: BackupManifest
  entries: ParsedBackupEntry[]
  warnings: string[]
}

const MANIFEST_NAME = 'manifest.json'

// PK = Zip magic bytes (0x50 0x4B 0x03 0x04) — same check the H9 import uses.
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

// H9 zip guards — REUSED unchanged (do not weaken).
// Maximum total uncompressed bytes we'll accept from a ZIP before aborting.
const MAX_UNCOMPRESSED_TOTAL = 100 * 1024 * 1024 // 100 MB
// Maximum uncompressed size for a single entry we decompress.
const MAX_UNCOMPRESSED_ENTRY = 50 * 1024 * 1024 // 50 MB

/**
 * Reject any entry that contains path-traversal sequences or absolute paths.
 * Returns the entry name unchanged when safe, or null when unsafe. (Mirrors the
 * H9 import guard; here we keep the relative path — `docs/<id>.json` — because
 * we look entries up by their manifest-declared path.)
 */
export function safeEntryName(name: string): string | null {
  if (name.startsWith('/') || name.startsWith('\\')) return null
  const parts = name.split(/[/\\]/)
  if (parts.some((p) => p === '..' || p === '.')) return null
  return name
}

/** Read an entry's declared uncompressed size from JSZip's internal metadata. */
function entryUncompressedSize(entry: JSZip.JSZipObject): number {
  return (
    (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0
  )
}

/**
 * Build a lossless workspace backup zip.
 *
 * Layout:
 *   manifest.json            — the BackupManifest
 *   docs/<id>.json           — JSON.stringify(content) (LOSSLESS, read back)
 *   docs/<safe-title>.md     — human-readable markdown (best-effort, never read)
 *
 * `createdAt` is injected (callers/scripts must not call Date.now()).
 * Never throws on a per-doc markdown failure — the `.md` is skipped, the
 * lossless `.json` is always written.
 */
export async function buildWorkspaceBackup(
  docs: BackupDocInput[],
  createdAt: string,
): Promise<Uint8Array> {
  const zip = new JSZip()
  const usedMdNames = new Set<string>()
  const manifestDocs: BackupManifestDoc[] = []

  for (const doc of docs) {
    const file = `docs/${doc.id}.json`
    // LOSSLESS: store the raw PM JSON verbatim.
    zip.file(file, JSON.stringify(doc.content))
    manifestDocs.push({
      id: doc.id,
      title: doc.title,
      folderId: doc.folderId,
      file,
    })

    // Best-effort human-readable markdown copy. NEVER read back; a failure here
    // must not abort the lossless backup of this or any other doc.
    try {
      const md = serializeMarkdown(doc.content ?? { type: 'doc', content: [] })
      const mdName = uniqueMdName(exportFilename(doc.title, 'md'), usedMdNames)
      zip.file(`docs/${mdName}`, md)
    } catch {
      // skip the markdown copy for this doc
    }
  }

  const manifest: BackupManifest = {
    version: BACKUP_FORMAT_VERSION,
    createdAt,
    docCount: manifestDocs.length,
    docs: manifestDocs,
  }
  zip.file(MANIFEST_NAME, JSON.stringify(manifest, null, 2))

  return zip.generateAsync({ type: 'uint8array' })
}

/** A markdown filename not already used, appending -2, -3 … on collision. */
function uniqueMdName(base: string, used: Set<string>): string {
  if (!used.has(base)) {
    used.add(base)
    return base
  }
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

function isManifest(value: unknown): value is BackupManifest {
  if (typeof value !== 'object' || value === null) return false
  const m = value as Record<string, unknown>
  return (
    typeof m.version === 'number' &&
    typeof m.createdAt === 'string' &&
    typeof m.docCount === 'number' &&
    Array.isArray(m.docs)
  )
}

/**
 * Parse a workspace backup zip back into its manifest + lossless entries.
 *
 * - Validates the PK zip magic and the presence of manifest.json (a non-backup
 *   zip → a clear thrown error).
 * - Applies the H9 guards: total + per-entry uncompressed size caps, and a
 *   path-traversal-safe entry name check.
 * - For each manifest doc, reads its `docs/<id>.json` and JSON.parses it back to
 *   the raw PM content. A missing / corrupt / oversized / unsafe entry pushes a
 *   warning and is SKIPPED — parse never throws past the initial validation.
 */
export async function parseWorkspaceBackup(bytes: Uint8Array): Promise<ParsedBackup> {
  if (!isPkZip(bytes)) {
    throw new Error('Not a backup: file is not a ZIP archive.')
  }

  const zip = await JSZip.loadAsync(bytes)

  // Zip-bomb guard: sum all declared uncompressed sizes up front.
  let totalUncompressed = 0
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue
    totalUncompressed += entryUncompressedSize(entry)
    if (totalUncompressed > MAX_UNCOMPRESSED_TOTAL) {
      throw new Error('Backup too large: uncompressed size exceeds the limit.')
    }
  }

  const manifestEntry = zip.files[MANIFEST_NAME]
  if (!manifestEntry || manifestEntry.dir) {
    throw new Error('Not a backup: manifest.json is missing.')
  }
  if (entryUncompressedSize(manifestEntry) > MAX_UNCOMPRESSED_ENTRY) {
    throw new Error('Backup manifest is too large.')
  }

  let manifest: BackupManifest
  try {
    const raw = await manifestEntry.async('string')
    const parsed = JSON.parse(raw)
    if (!isManifest(parsed)) {
      throw new Error('manifest.json is not a valid backup manifest.')
    }
    manifest = parsed
  } catch (err) {
    throw new Error(`Not a backup: ${err instanceof Error ? err.message : String(err)}`)
  }

  const warnings: string[] = []
  const entries: ParsedBackupEntry[] = []

  for (const meta of manifest.docs) {
    const safe = safeEntryName(meta.file)
    if (safe === null) {
      warnings.push(`Skipped unsafe entry path: ${meta.file}`)
      continue
    }
    const entry = zip.files[safe]
    if (!entry || entry.dir) {
      warnings.push(`Missing backup entry for doc ${meta.id} (${safe}).`)
      continue
    }
    if (entryUncompressedSize(entry) > MAX_UNCOMPRESSED_ENTRY) {
      warnings.push(`Skipped oversized entry for doc ${meta.id} (${safe}).`)
      continue
    }
    try {
      const json = await entry.async('string')
      const content = JSON.parse(json)
      entries.push({ meta, content })
    } catch (err) {
      warnings.push(
        `Corrupt entry for doc ${meta.id} (${safe}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
    }
  }

  return { manifest, entries, warnings }
}
