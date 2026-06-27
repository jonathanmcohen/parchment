// J1-3: storage adapter for doc assets. Dispatches disk vs S3 on the SHARED
// isS3Configured() (BACKUP_S3_* namespace — NO separate ASSETS_S3_* env, ADR J1-0b).
// S3 objects use an `assets/`-prefixed key so attachment objects never collide with
// backup objects in the same bucket. Disk objects live at `.assets/<docId>/<name>`
// under the files root (via the pure asset-path resolver + disk/mirror's absPath).
//
// No 'server-only' guard so it stays unit-testable (it is only pulled into the
// nodejs-runtime asset routes in app code).

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { getObjectFromS3, isS3Configured, uploadToS3 } from '@/lib/backup/s3'
import { absPath } from '@/lib/disk/mirror'
import { assetRelPath } from '@/lib/uploads/asset-path'

/** S3 key for a doc asset — the relative disk path under an `assets/` prefix. */
function s3Key(doc: { id: string }, name: string): string {
  // assetRelPath validates doc.id + name and yields `.assets/<id>/<name>`.
  // Strip the leading dot so the S3 key reads `assets/<id>/<name>`.
  return `assets/${assetRelPath(doc, name).slice('.assets/'.length)}`
}

/**
 * Persist an asset's bytes. On S3 → uploadToS3(prefixedKey,…); on disk → mkdir -p +
 * writeFile at the resolved path. Validates the filename via assetRelPath (throws on
 * an unsafe name — defense in depth even though callers pass minted names).
 */
export async function putAsset(
  doc: { id: string },
  name: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<void> {
  if (isS3Configured()) {
    await uploadToS3(s3Key(doc, name), bytes, contentType)
    return
  }
  const abs = absPath(assetRelPath(doc, name))
  await mkdir(dirname(abs), { recursive: true })
  await writeFile(abs, Buffer.from(bytes))
}

/**
 * Read an asset's bytes, or null when it does not exist. Never throws on a missing
 * object (disk ENOENT → null; S3 NoSuchKey → null). On S3, reads the prefixed key.
 */
export async function getAsset(doc: { id: string }, name: string): Promise<Uint8Array | null> {
  if (isS3Configured()) {
    return getObjectFromS3(s3Key(doc, name))
  }
  try {
    const buf = await readFile(absPath(assetRelPath(doc, name)))
    return new Uint8Array(buf)
  } catch {
    return null
  }
}
