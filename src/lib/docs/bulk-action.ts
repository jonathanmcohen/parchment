// J11-1: pure validator/normalizer for POST /api/docs/bulk. NO db, NO network.
// The route maps the parsed descriptor to repo calls (move/trash/tag/restore/delete).
// Keeping this pure makes the action surface unit-testable without Postgres.

export type BulkAction = 'move' | 'trash' | 'tag' | 'restore' | 'delete'

export type ParsedBulkRequest =
  | { ok: false; error: string }
  | { ok: true; action: 'move'; ids: string[]; folderId: string | null }
  | { ok: true; action: 'tag'; ids: string[]; tagId: string }
  | { ok: true; action: 'trash' | 'restore' | 'delete'; ids: string[] }

const ACTIONS: ReadonlySet<string> = new Set<BulkAction>([
  'move',
  'trash',
  'tag',
  'restore',
  'delete',
])

interface RawBulkBody {
  ids?: unknown
  action?: unknown
  folderId?: unknown
  tagId?: unknown
}

/** Validate + normalize a bulk request body. Never throws. */
export function parseBulkRequest(body: RawBulkBody): ParsedBulkRequest {
  const { ids, action } = body

  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => typeof id === 'string')) {
    return { ok: false, error: 'ids must be a non-empty string array' }
  }
  const safeIds = ids as string[]

  if (typeof action !== 'string' || !ACTIONS.has(action)) {
    return { ok: false, error: 'action must be move, trash, tag, restore, or delete' }
  }

  if (action === 'tag') {
    if (typeof body.tagId !== 'string' || body.tagId.length === 0) {
      return { ok: false, error: 'tagId is required for tag action' }
    }
    return { ok: true, action: 'tag', ids: safeIds, tagId: body.tagId }
  }

  if (action === 'move') {
    const folderId =
      body.folderId === null ? null : typeof body.folderId === 'string' ? body.folderId : null
    return { ok: true, action: 'move', ids: safeIds, folderId }
  }

  // trash | restore | delete — no extra fields.
  return { ok: true, action: action as 'trash' | 'restore' | 'delete', ids: safeIds }
}
