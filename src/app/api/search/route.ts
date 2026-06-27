import { type NextRequest, NextResponse } from 'next/server'
import { apiAuthFailure, authenticateRequest } from '@/lib/auth/guard'
import { findFolderByName } from '@/lib/docs/folders-repo'
import type { DocRow } from '@/lib/docs/repo'
import type { SearchFilters } from '@/lib/docs/search-repo'
import { searchFullText, searchSemantic } from '@/lib/docs/search-repo'
import { findTagByName } from '@/lib/docs/tags-repo'
import { embed, isSemanticEnabled } from '@/lib/search/embeddings'
import { parseQuery } from '@/lib/search/operators'

export const dynamic = 'force-dynamic'

function serializeRow(row: DocRow) {
  return {
    id: row.id,
    title: row.title,
    folderId: row.folderId,
    starred: row.starred,
    size: Number(row.size),
    preview: row.preview,
    updatedAt: row.updatedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  }
}

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req, { require: 'docs:read' })
  if (!auth.ok) return apiAuthFailure(auth.status)
  const user = auth.user

  const params = req.nextUrl.searchParams
  const rawQ = params.get('q') ?? ''
  const mode = params.get('mode') ?? 'keyword'
  const folderParam = params.get('folder')
  const tagParam = params.get('tag')
  const starredParam = params.get('starred')

  // J6: parse structured operators (tag:/folder:/is:starred/title:/before:/after:)
  // out of the free-text query. The remaining text feeds FTS/semantic.
  const parsed = parseQuery(rawQ)
  const q = parsed.text

  const filters: SearchFilters = {}

  // Operators resolved name→id (owner-scoped). A name that matches nothing means
  // "no doc qualifies", so we short-circuit to an empty result set rather than
  // pass a bogus id into the query (which Postgres would reject as a bad uuid).
  let unresolvedFilter = false
  if (parsed.filters.tagName !== undefined) {
    const tagId = await findTagByName(user.id, parsed.filters.tagName)
    if (tagId === null) unresolvedFilter = true
    else filters.tagId = tagId
  }
  if (parsed.filters.folderName !== undefined) {
    const folderId = await findFolderByName(user.id, parsed.filters.folderName)
    if (folderId === null) unresolvedFilter = true
    else filters.folderId = folderId
  }
  if (parsed.filters.starred === true) {
    filters.starred = true
  }
  if (parsed.filters.titleContains !== undefined) {
    filters.titleContains = parsed.filters.titleContains
  }
  if (parsed.filters.before !== undefined) filters.before = parsed.filters.before
  if (parsed.filters.after !== undefined) filters.after = parsed.filters.after

  // Explicit query params (the FileManager's existing tag/folder/starred views)
  // take precedence over operators parsed from the text box.
  if (folderParam !== null) {
    filters.folderId = folderParam === 'root' ? null : folderParam
  }
  if (tagParam) {
    filters.tagId = tagParam
  }
  if (starredParam === 'true') {
    filters.starred = true
  }

  const semanticEnabled = isSemanticEnabled()
  let rows: DocRow[]

  if (unresolvedFilter) {
    // A tag:/folder: name that resolved to nothing → no document can match.
    rows = []
  } else if (mode === 'semantic') {
    if (semanticEnabled) {
      const v = await embed(q)
      if (v) {
        rows = await searchSemantic(user.id, v, filters)
      } else {
        // embed returned null (error or disabled) — fall back
        rows = await searchFullText(user.id, q, filters)
      }
    } else {
      // Semantic not configured — graceful fallback to FTS
      rows = await searchFullText(user.id, q, filters)
    }
  } else {
    rows = await searchFullText(user.id, q, filters)
  }

  return NextResponse.json({
    mode,
    semanticEnabled,
    results: rows.map(serializeRow),
  })
}
