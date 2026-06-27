/**
 * Per-user storage quota measurement (I2).
 *
 * Asset storage lives at `${filesRoot}/.assets/${docId}/*.{png,jpg,...}`.
 * This module measures disk usage and enforces quota limits at upload time.
 *
 * The DB query for doc IDs is done by the asset route (which already has the
 * db context) and passes the ids to getUsedAssetBytes. This keeps quota.ts
 * pure (no @/db import) and testable with only the fs.
 */

import { stat, readdir } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Sum file sizes under the assets root for the given docIds.
 *
 * @param docIds     Array of document IDs owned by the user (from DB query).
 * @param assetsRoot Path to the `.assets` directory (e.g. `${filesRoot}/.assets`).
 */
export async function getUsedAssetBytes(docIds: string[], assetsRoot: string): Promise<number> {
  let total = 0

  for (const docId of docIds) {
    const docDir = join(assetsRoot, docId)
    let files: string[]
    try {
      files = await readdir(docDir)
    } catch {
      // Directory doesn't exist for this doc — zero assets.
      continue
    }

    for (const file of files) {
      try {
        const s = await stat(join(docDir, file))
        if (s.isFile()) total += s.size
      } catch {
        // File disappeared between listing and stat — ignore.
      }
    }
  }

  return total
}

/** Format bytes as a human-readable MB string (e.g. '1.5 MB'). */
export function formatBytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Check whether an upload fits within the user's quota.
 *
 * @returns true  — upload is allowed (quota is 0/unlimited or within limit)
 * @returns false — upload would exceed quota
 */
export function checkQuota({
  quotaMb,
  usedBytes,
  fileBytes,
}: {
  quotaMb: number
  usedBytes: number
  fileBytes: number
}): boolean {
  if (quotaMb === 0) return true // unlimited
  const quotaBytes = quotaMb * 1024 * 1024
  return usedBytes + fileBytes <= quotaBytes
}
