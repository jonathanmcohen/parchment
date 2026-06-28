import { type NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, isAdmin } from '@/lib/auth/guard'
import {
  restoreWorkspaceBackup,
  restoreWorkspaceBackupSelective,
  type SelectiveRestoreFilter,
} from '@/lib/backup/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_BYTES = 100 * 1024 * 1024 // 100 MB

/**
 * POST /api/settings/backup/restore — multipart { zip, filter? }
 *
 * Admin-only. Restores an uploaded backup zip. With a `filter` it does a
 * selective restore (restoreWorkspaceBackupSelective); without, a full restore.
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

  // Accept either 'zip' (picker) or 'file' (legacy form) as the field name.
  const fileField = formData.get('zip') ?? formData.get('file')
  if (!(fileField instanceof File)) {
    return NextResponse.json({ error: 'missing zip field' }, { status: 400 })
  }
  if (fileField.size > MAX_BYTES) {
    return NextResponse.json({ error: 'file too large (max 100 MB)' }, { status: 413 })
  }

  const filter = parseFilter(formData.get('filter'))
  const bytes = new Uint8Array(await fileField.arrayBuffer())

  try {
    const result = filter
      ? await restoreWorkspaceBackupSelective(user.id, bytes, filter)
      : await restoreWorkspaceBackup(user.id, bytes)
    return NextResponse.json(result, { status: 200 })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'invalid backup file' },
      { status: 400 },
    )
  }
}

/** Parse an optional selective-restore filter from the multipart `filter` field. */
function parseFilter(raw: FormDataEntryValue | null): SelectiveRestoreFilter | null {
  if (typeof raw !== 'string' || raw === '') return null
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>
    const folderPrefixes = Array.isArray(obj.folderPrefixes)
      ? obj.folderPrefixes.filter((p): p is string => typeof p === 'string')
      : undefined
    const docTitles = Array.isArray(obj.docTitles)
      ? obj.docTitles.filter((t): t is string => typeof t === 'string')
      : undefined
    if (!folderPrefixes && !docTitles) return null
    return { ...(folderPrefixes ? { folderPrefixes } : {}), ...(docTitles ? { docTitles } : {}) }
  } catch {
    return null
  }
}
