import 'server-only'

/**
 * GDPR data export builder (I9).
 *
 * Produces a ZIP containing:
 *   export-manifest.json   { exportedAt, userId, appVersion }
 *   profile.json           { name, email, createdAt, role }
 *   documents/{docId}.json { id, title, folderId, content, markdown, createdAt, updatedAt }
 *
 * Security:
 *   - ownerId filter is applied on EVERY query — SQL WHERE ownerId = userId.
 *   - No credential fields (passwordHash, tokenHash, totpSecret, recoveryCodes) included.
 *   - No other users' data is queried.
 *   - Trashed docs are EXCLUDED (post-fetch filter on trashedAt).
 */

import { and, eq, isNull } from 'drizzle-orm'
import JSZip from 'jszip'
import { db, schema } from '@/db'
import { APP_VERSION } from '@/lib/version'

// ── Pure helpers (exported for unit tests) ────────────────────────────────────

export interface GdprManifest {
  exportedAt: string
  userId: string
  appVersion: string
}

export function buildGdprManifest(userId: string, appVersion: string): GdprManifest {
  return { exportedAt: new Date().toISOString(), userId, appVersion }
}

export interface GdprProfile {
  name: string
  email: string
  role: string
  createdAt: Date
}

export function buildGdprProfile(user: {
  name: string
  email: string
  role: string
  createdAt: Date
}): GdprProfile {
  // Explicit allowlist — no credential fields (passwordHash, tokenHash, etc).
  return { name: user.name, email: user.email, role: user.role, createdAt: user.createdAt }
}

export interface GdprDocEntry {
  id: string
  title: string
  folderId: string | null
  content: unknown
  markdown: string
  createdAt: Date
  updatedAt: Date
}

export function buildGdprDocEntry(doc: {
  id: string
  title: string
  folderId: string | null
  content: unknown
  markdown: string
  createdAt: Date
  updatedAt: Date
}): GdprDocEntry {
  // Explicit allowlist — no ownerId, no trashedAt, no disk path or sync hash.
  return {
    id: doc.id,
    title: doc.title,
    folderId: doc.folderId,
    content: doc.content,
    markdown: doc.markdown,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}

// ── Full GDPR export (requires DB + JSZip) ────────────────────────────────────

/**
 * Build a GDPR-compliant data export ZIP for one user.
 * All DB queries use WHERE ownerId = userId — no cross-user leakage possible.
 */
export async function buildGdprExport(userId: string): Promise<Uint8Array> {
  // 1. Fetch user profile (allowlisted fields only).
  const [user] = await db
    .select({
      name: schema.users.name,
      email: schema.users.email,
      role: schema.users.role,
      createdAt: schema.users.createdAt,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1)

  if (!user) throw new Error(`User ${userId} not found`)

  // 2. Fetch non-trashed documents owned by this user (ownerId + trashedAt IS NULL).
  const docs = await db
    .select({
      id: schema.documents.id,
      title: schema.documents.title,
      folderId: schema.documents.folderId,
      content: schema.documents.content,
      markdown: schema.documents.markdown,
      createdAt: schema.documents.createdAt,
      updatedAt: schema.documents.updatedAt,
    })
    .from(schema.documents)
    .where(and(eq(schema.documents.ownerId, userId), isNull(schema.documents.trashedAt)))

  // 3. Build ZIP.
  const zip = new JSZip()

  zip.file('export-manifest.json', JSON.stringify(buildGdprManifest(userId, APP_VERSION), null, 2))
  zip.file('profile.json', JSON.stringify(buildGdprProfile(user), null, 2))

  for (const doc of docs) {
    zip.file(`documents/${doc.id}.json`, JSON.stringify(buildGdprDocEntry(doc), null, 2))
  }

  const arrayBuffer = await zip.generateAsync({ type: 'arraybuffer' })
  return new Uint8Array(arrayBuffer)
}
