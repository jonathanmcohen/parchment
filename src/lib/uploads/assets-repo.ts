// v0.2.12: database access for document assets.
//
// The `assets` table is the source of truth for asset bytes and metadata. The copy
// written beside the .md on disk is a one-directional mirror; nothing here reads
// from disk, and the mirror never writes back into this table.
//
// When BACKUP_S3_* is configured the bytes live in S3 and `bytes` is null, but the
// row is still written so metadata, quota, and the mirror have one source.
//
// No 'server-only' guard so it stays unit-testable.

import { createHash } from 'node:crypto'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { db, schema } from '@/db'

export type AssetRow = {
  id: string
  docId: string
  filename: string
  mime: string
  byteSize: number
  sha256: string
}

/** sha256 of the bytes, hex. Used for dedupe and to skip redundant mirror writes. */
export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(Buffer.from(bytes)).digest('hex')
}

/**
 * Insert or replace an asset row. `bytes` is null for S3-backed deployments.
 * Upsert on (doc_id, filename) so re-uploading the same name replaces cleanly
 * rather than colliding on the unique constraint.
 */
export async function upsertAsset(input: {
  docId: string
  filename: string
  mime: string
  bytes: Uint8Array
  storeInDb: boolean
}): Promise<AssetRow> {
  const digest = sha256Hex(input.bytes)
  const [row] = await db
    .insert(schema.assets)
    .values({
      docId: input.docId,
      filename: input.filename,
      mime: input.mime,
      byteSize: input.bytes.byteLength,
      sha256: digest,
      bytes: input.storeInDb ? Buffer.from(input.bytes) : null,
    })
    .onConflictDoUpdate({
      target: [schema.assets.docId, schema.assets.filename],
      set: {
        mime: input.mime,
        byteSize: input.bytes.byteLength,
        sha256: digest,
        bytes: input.storeInDb ? Buffer.from(input.bytes) : null,
      },
    })
    .returning({
      id: schema.assets.id,
      docId: schema.assets.docId,
      filename: schema.assets.filename,
      mime: schema.assets.mime,
      byteSize: schema.assets.byteSize,
      sha256: schema.assets.sha256,
    })
  return row as AssetRow
}

/** Bytes for one asset, or null when absent or S3-backed. */
export async function getAssetBytes(docId: string, filename: string): Promise<Uint8Array | null> {
  const [row] = await db
    .select({ bytes: schema.assets.bytes })
    .from(schema.assets)
    .where(and(eq(schema.assets.docId, docId), eq(schema.assets.filename, filename)))
    .limit(1)
  if (!row?.bytes) return null
  return new Uint8Array(row.bytes)
}

/** Every asset for a document, without the bytes. Used by the disk mirror. */
export async function listAssets(docId: string): Promise<AssetRow[]> {
  return (await db
    .select({
      id: schema.assets.id,
      docId: schema.assets.docId,
      filename: schema.assets.filename,
      mime: schema.assets.mime,
      byteSize: schema.assets.byteSize,
      sha256: schema.assets.sha256,
    })
    .from(schema.assets)
    .where(eq(schema.assets.docId, docId))) as AssetRow[]
}

/**
 * Total asset bytes across the given documents. Replaces the old disk-globbing
 * quota path, which was both slower and wrong after a restore.
 * Returns 0 for an empty doc list rather than issuing a query.
 */
export async function getUsedAssetBytesFromDb(docIds: string[]): Promise<number> {
  if (docIds.length === 0) return 0
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${schema.assets.byteSize}), 0)` })
    .from(schema.assets)
    .where(inArray(schema.assets.docId, docIds))
  return Number(row?.total ?? 0)
}

/** Remove one asset row. Disk cleanup is the mirror's job. */
export async function deleteAsset(docId: string, filename: string): Promise<void> {
  await db
    .delete(schema.assets)
    .where(and(eq(schema.assets.docId, docId), eq(schema.assets.filename, filename)))
}
