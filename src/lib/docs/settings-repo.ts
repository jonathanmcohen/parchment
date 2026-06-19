import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/db'

// E11: generic owner key-value settings store.

export const TRASH_RETENTION_KEY = 'trashRetentionDays'
export const DEFAULT_TRASH_RETENTION_DAYS = 30

/** Return the stored value for (ownerId, key), or `fallback` if unset. */
export async function getSetting<T>(ownerId: string, key: string, fallback: T): Promise<T> {
  const [row] = await db
    .select({ value: schema.settings.value })
    .from(schema.settings)
    .where(and(eq(schema.settings.ownerId, ownerId), eq(schema.settings.key, key)))
    .limit(1)
  if (row === undefined) return fallback
  return row.value as T
}

/** Upsert (ownerId, key) = value. */
export async function setSetting(ownerId: string, key: string, value: unknown): Promise<void> {
  await db
    .insert(schema.settings)
    .values({ ownerId, key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [schema.settings.ownerId, schema.settings.key],
      set: { value, updatedAt: new Date() },
    })
}

/** Read the owner's trash-retention window in days (default 30). */
export async function getTrashRetentionDays(ownerId: string): Promise<number> {
  return getSetting<number>(ownerId, TRASH_RETENTION_KEY, DEFAULT_TRASH_RETENTION_DAYS)
}

/** Persist trash-retention days (clamped to integer >= 0). */
export async function setTrashRetentionDays(ownerId: string, days: number): Promise<void> {
  const clamped = Math.max(0, Math.round(days))
  await setSetting(ownerId, TRASH_RETENTION_KEY, clamped)
}
