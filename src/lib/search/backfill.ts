// J4-2: best-effort embedding backfill for docs created before EMBEDDINGS_URL
// was configured (their `embedding` column is NULL). It pages through the
// null-embedding rows, embeds each via the OpenAI-compatible endpoint, and
// writes the vector back. It NEVER throws and NEVER blocks a critical path — a
// failed embed/write is skipped and the sweep continues.
//
// The core (`backfillEmbeddings`) takes all of its dependencies as parameters so
// it is unit-testable with NO db and NO live endpoint. `runEmbeddingBackfill()`
// is the default-wired entry the scheduler + CLI call; it lazily imports `@/db`
// so this module is importable in a pure/client context without dragging in pg.

export interface BackfillRow {
  id: string
  title: string | null
  markdown: string
}

export interface BackfillDeps {
  /** Whether semantic search is configured. When false the whole run is a no-op. */
  isEnabled: () => boolean
  /** Fetch up to `limit` docs whose embedding IS NULL (any owner). */
  fetchBatch: (limit: number) => Promise<BackfillRow[]>
  /** Persist a computed vector for `docId`. */
  persist: (docId: string, vector: number[]) => Promise<void>
  /** Embed a string → vector or null (disabled/error). */
  embed: (text: string) => Promise<number[] | null>
  /** Rows fetched per page. Default 50. */
  batchSize?: number
  /** Hard cap on docs processed in one run. Default 1000. */
  maxDocs?: number
}

export interface BackfillResult {
  /** Docs we attempted to embed. */
  processed: number
  /** Docs whose vector was successfully written. */
  filled: number
  /** True when the run was a no-op because semantic was disabled. */
  skipped: boolean
}

/**
 * Pure, injectable backfill core. Pages through null-embedding rows via
 * `fetchBatch`, embeds + persists each, and reports counts. Bounded by
 * `maxDocs`; stops on the first empty page. Best-effort throughout.
 */
export async function backfillEmbeddings(deps: BackfillDeps): Promise<BackfillResult> {
  if (!deps.isEnabled()) {
    return { processed: 0, filled: 0, skipped: true }
  }

  const batchSize = Math.max(1, deps.batchSize ?? 50)
  const maxDocs = Math.max(1, deps.maxDocs ?? 1000)

  let processed = 0
  let filled = 0

  while (processed < maxDocs) {
    const remaining = maxDocs - processed
    const limit = Math.min(batchSize, remaining)

    let rows: BackfillRow[]
    try {
      rows = await deps.fetchBatch(limit)
    } catch {
      // A read failure ends the run cleanly — never throw out of a best-effort job.
      break
    }
    if (rows.length === 0) break

    for (const row of rows) {
      processed += 1
      const text = `${row.title ?? ''}\n${row.markdown}`
      try {
        const vector = await deps.embed(text)
        if (vector) {
          await deps.persist(row.id, vector)
          filled += 1
        }
      } catch {
        // skip this doc; the next run will retry it (its embedding is still NULL)
      }
      if (processed >= maxDocs) break
    }

    // A short page means we've drained the null-embedding set.
    if (rows.length < limit) break
  }

  return { processed, filled, skipped: false }
}

/**
 * Default-wired backfill: real db + the configured embeddings endpoint. Lazily
 * imports `@/db` and the embeddings module so this file stays pure-importable.
 * Returns the same shape as the core. Never throws.
 */
export async function runEmbeddingBackfill(
  opts: { batchSize?: number; maxDocs?: number } = {},
): Promise<BackfillResult> {
  const { isSemanticEnabled, embed } = await import('@/lib/search/embeddings')
  if (!isSemanticEnabled()) return { processed: 0, filled: 0, skipped: true }

  const { db, schema } = await import('@/db')
  const { and, eq, isNull } = await import('drizzle-orm')

  return backfillEmbeddings({
    isEnabled: isSemanticEnabled,
    embed,
    batchSize: opts.batchSize ?? 50,
    maxDocs: opts.maxDocs ?? 1000,
    fetchBatch: (limit) =>
      db
        .select({
          id: schema.documents.id,
          title: schema.documents.title,
          markdown: schema.documents.markdown,
        })
        .from(schema.documents)
        .where(and(isNull(schema.documents.embedding), isNull(schema.documents.trashedAt)))
        .limit(limit),
    persist: async (docId, vector) => {
      await db
        .update(schema.documents)
        .set({ embedding: vector })
        .where(eq(schema.documents.id, docId))
    },
  })
}
