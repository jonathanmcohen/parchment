import 'server-only'

/**
 * Workspace usage query (I2).
 *
 * Returns per-user doc counts, content sizes (from DB), asset disk usage (from
 * filesystem), and DB total size via `pg_database_size(current_database())` —
 * NOT hardcoded to a specific DB name (§7v).
 */

import { join } from 'node:path'
import { sql } from 'drizzle-orm'
import { db, schema } from '@/db'
import { env } from '@/lib/env'
import { getUsedAssetBytes } from '@/lib/quota'

export { formatBytes } from '@/lib/quota'

export interface UsageSummary {
  userId: string
  name: string
  email: string
  quotaMb: number
  docCount: number
  contentSizeBytes: number
  assetSizeBytes: number
}

/** Build a UsageSummary from raw DB + disk values (pure — no I/O). */
export function buildUsageSummaryRow(input: {
  userId: string
  name: string
  email: string
  quotaMb: number
  docCount: number
  contentSizeBytes: number
  assetSizeBytes: number
}): UsageSummary {
  return { ...input }
}

export interface WorkspaceUsage {
  users: UsageSummary[]
  dbSizeBytes: number
  totalAssetBytes: number
}

/**
 * Fetch workspace usage for all users.
 *
 * DB query for content size uses `pg_column_size(content)` aggregate.
 * DB total size uses `pg_database_size(current_database())` — NOT hardcoded.
 */
export async function getWorkspaceUsage(): Promise<WorkspaceUsage> {
  // 1. Get all users with their quota.
  const users = await db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      quotaMb: schema.users.quotaMb,
    })
    .from(schema.users)

  // 2. Per-user doc count + content size (non-trashed docs only).
  // db.execute returns a QueryResult; access .rows to iterate (node-postgres shape).
  const docStatsResult = await db.execute(sql`
    SELECT
      owner_id,
      COUNT(*)::text AS doc_count,
      COALESCE(SUM(pg_column_size(content)), 0)::text AS content_size
    FROM documents
    WHERE trashed_at IS NULL
    GROUP BY owner_id
  `)
  // Support both array-like and rows-property shapes from different driver versions.
  const docStatsRows = (
    Array.isArray(docStatsResult)
      ? docStatsResult
      : ((docStatsResult as { rows?: unknown[] }).rows ?? [])
  ) as Array<{ owner_id: string; doc_count: string; content_size: string }>

  const docStatMap = new Map<string, { docCount: number; contentSizeBytes: number }>()
  for (const row of docStatsRows) {
    docStatMap.set(row.owner_id, {
      docCount: Number(row.doc_count),
      contentSizeBytes: Number(row.content_size),
    })
  }

  // 3. DB total size — uses current_database() so it works regardless of DB name (§7v).
  const sizeResult = await db.execute(
    sql`SELECT pg_database_size(current_database())::text AS db_size`,
  )
  const sizeRows = (
    Array.isArray(sizeResult) ? sizeResult : ((sizeResult as { rows?: unknown[] }).rows ?? [])
  ) as Array<{ db_size: string }>
  const dbSizeBytes = Number(sizeRows[0]?.db_size ?? 0)

  // 4. Per-user asset disk usage — requires knowing each user's doc IDs.
  const assetsRoot = join(env.filesRoot, '.assets')
  const allDocs = await db
    .select({ id: schema.documents.id, ownerId: schema.documents.ownerId })
    .from(schema.documents)

  // Build a map of ownerId → docIds.
  const ownerDocIds = new Map<string, string[]>()
  for (const doc of allDocs) {
    const list = ownerDocIds.get(doc.ownerId) ?? []
    list.push(doc.id)
    ownerDocIds.set(doc.ownerId, list)
  }

  let totalAssetBytes = 0
  const summaries: UsageSummary[] = []

  for (const u of users) {
    const docIds = ownerDocIds.get(u.id) ?? []
    const assetSizeBytes = await getUsedAssetBytes(docIds, assetsRoot)
    totalAssetBytes += assetSizeBytes

    const stats = docStatMap.get(u.id) ?? { docCount: 0, contentSizeBytes: 0 }

    summaries.push(
      buildUsageSummaryRow({
        userId: u.id,
        name: u.name,
        email: u.email,
        quotaMb: u.quotaMb,
        docCount: stats.docCount,
        contentSizeBytes: stats.contentSizeBytes,
        assetSizeBytes,
      }),
    )
  }

  return { users: summaries, dbSizeBytes, totalAssetBytes }
}
