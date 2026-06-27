import { type NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, isAdmin } from '@/lib/auth/guard'
import {
  entryFolderPath,
  matchesSelectiveFilter,
  parseWorkspaceBackup,
  type SelectiveRestoreFilter,
} from '@/lib/backup/service'
import { listFolders } from '@/lib/docs/folders-repo'
import { listDocuments } from '@/lib/docs/repo'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_BYTES = 100 * 1024 * 1024 // 100 MB

/**
 * POST /api/settings/backup/restore/dry-run — multipart { zip, filter? }
 *
 * Admin-only. Parses the backup zip and applies the selective filter WITHOUT
 * writing any document. Returns a per-entry inclusion list plus would-create /
 * would-skip / filtered counts. wouldSkip = included entries whose original doc
 * id already exists for the admin.
 */
export async function POST(req: NextRequest) {
  const user = await authenticateRequest(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!isAdmin(user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const contentLength = req.headers.get('content-length')
  if (contentLength !== null && Number(contentLength) > MAX_BYTES) {
    return NextResponse.json({ error: 'file too large (max 100 MB)' }, { status: 413 })
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'invalid multipart body' }, { status: 400 })
  }

  const fileField = formData.get('zip')
  if (!(fileField instanceof File)) {
    return NextResponse.json({ error: 'missing zip field' }, { status: 400 })
  }
  if (fileField.size > MAX_BYTES) {
    return NextResponse.json({ error: 'file too large (max 100 MB)' }, { status: 413 })
  }

  const filter = parseFilter(formData.get('filter'))
  const bytes = new Uint8Array(await fileField.arrayBuffer())

  let parsed: Awaited<ReturnType<typeof parseWorkspaceBackup>>
  try {
    parsed = await parseWorkspaceBackup(bytes)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'invalid backup file' },
      { status: 400 },
    )
  }

  const folders = await listFolders(user.id)
  const existingIds = new Set((await listDocuments(user.id)).map((d) => d.id))

  let wouldCreate = 0
  let wouldSkip = 0
  let filtered = 0
  const entries = parsed.entries.map((entry) => {
    const included = matchesSelectiveFilter(entry, filter, folders)
    if (!included) {
      filtered++
    } else if (existingIds.has(entry.meta.id)) {
      wouldSkip++
    } else {
      wouldCreate++
    }
    return {
      title: entry.meta.title,
      diskPath: `${entryFolderPath(entry, folders)}${entry.meta.title}`,
      included,
    }
  })

  return NextResponse.json({ dryRun: true, wouldCreate, wouldSkip, filtered, entries })
}

/** Parse an optional selective-restore filter from a multipart `filter` field. */
function parseFilter(raw: FormDataEntryValue | null): SelectiveRestoreFilter {
  if (typeof raw !== 'string' || raw === '') return {}
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>
    const folderPrefixes = Array.isArray(obj.folderPrefixes)
      ? obj.folderPrefixes.filter((p): p is string => typeof p === 'string')
      : undefined
    const docTitles = Array.isArray(obj.docTitles)
      ? obj.docTitles.filter((t): t is string => typeof t === 'string')
      : undefined
    return {
      ...(folderPrefixes ? { folderPrefixes } : {}),
      ...(docTitles ? { docTitles } : {}),
    }
  } catch {
    return {}
  }
}
