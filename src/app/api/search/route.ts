import { type NextRequest, NextResponse } from 'next/server'
import { apiAuthFailure, authenticateRequest } from '@/lib/auth/guard'
import type { DocRow } from '@/lib/docs/repo'
import { searchFullText, searchSemantic } from '@/lib/docs/search-repo'
import { embed, isSemanticEnabled } from '@/lib/search/embeddings'

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
  const q = params.get('q') ?? ''
  const mode = params.get('mode') ?? 'keyword'
  const folderParam = params.get('folder')
  const tagParam = params.get('tag')
  const starredParam = params.get('starred')

  const filters: import('@/lib/docs/search-repo').SearchFilters = {}

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

  if (mode === 'semantic') {
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
