import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm'
import { db, schema } from '@/db'
import type { DocRow } from '@/lib/docs/repo'

export interface SearchFilters {
  folderId?: string | null
  tagId?: string
  starred?: boolean
}

const docRowSelect = {
  id: schema.documents.id,
  title: schema.documents.title,
  updatedAt: schema.documents.updatedAt,
  folderId: schema.documents.folderId,
  starred: schema.documents.starred,
  createdAt: schema.documents.createdAt,
  size: sql<number>`length(${schema.documents.markdown})`.as('size'),
  preview: sql<string>`left(${schema.documents.markdown}, 140)`.as('preview'),
}

function buildFilterConditions(ownerId: string, filters?: SearchFilters) {
  const conditions = [eq(schema.documents.ownerId, ownerId), isNull(schema.documents.trashedAt)]

  if (filters) {
    if ('folderId' in filters) {
      const fid = filters.folderId
      conditions.push(
        fid === null ? isNull(schema.documents.folderId) : eq(schema.documents.folderId, fid),
      )
    }
    if (filters.starred === true) {
      conditions.push(eq(schema.documents.starred, true))
    }
  }

  return conditions
}

/** Full-text search over title+markdown, ranked. Excludes trashed. */
export async function searchFullText(
  ownerId: string,
  q: string,
  filters?: SearchFilters,
): Promise<DocRow[]> {
  if (!q.trim()) return []

  const conditions = buildFilterConditions(ownerId, filters)
  conditions.push(sql`${schema.documents.searchVector} @@ websearch_to_tsquery('english', ${q})`)

  const baseQuery = db.select(docRowSelect).from(schema.documents)

  if (filters?.tagId) {
    return baseQuery
      .innerJoin(schema.documentTags, eq(schema.documentTags.docId, schema.documents.id))
      .where(and(...conditions, eq(schema.documentTags.tagId, filters.tagId)))
      .orderBy(
        sql`ts_rank(${schema.documents.searchVector}, websearch_to_tsquery('english', ${q})) desc`,
      )
      .limit(30)
  }

  return baseQuery
    .where(and(...conditions))
    .orderBy(
      sql`ts_rank(${schema.documents.searchVector}, websearch_to_tsquery('english', ${q})) desc`,
    )
    .limit(30)
}

/** Nearest docs by cosine distance to `embedding`. Only docs whose embedding is set; excludes trashed. */
export async function searchSemantic(
  ownerId: string,
  embedding: number[],
  filters?: SearchFilters,
): Promise<DocRow[]> {
  const vecLiteral = `[${embedding.join(',')}]`
  const conditions = buildFilterConditions(ownerId, filters)
  conditions.push(isNotNull(schema.documents.embedding))

  const baseQuery = db.select(docRowSelect).from(schema.documents)

  if (filters?.tagId) {
    return baseQuery
      .innerJoin(schema.documentTags, eq(schema.documentTags.docId, schema.documents.id))
      .where(and(...conditions, eq(schema.documentTags.tagId, filters.tagId)))
      .orderBy(sql`${schema.documents.embedding} <=> ${vecLiteral}::vector asc`)
      .limit(20)
  }

  return baseQuery
    .where(and(...conditions))
    .orderBy(sql`${schema.documents.embedding} <=> ${vecLiteral}::vector asc`)
    .limit(20)
}
