// Pure module — no db, no React, no DOM. Client-safe.

export interface SmartCriteria {
  titleContains?: string
  starred?: boolean
  folderId?: string | null
  /** J2-1: docs carrying this tag id. */
  tagId?: string
  /** J2-1: docs whose updatedAt is within the last N days (positive integer). */
  updatedWithinDays?: number
}

/**
 * Parse unknown JSON (from db/api) into a clean SmartCriteria — drop unknown
 * keys, coerce types, trim titleContains (empty → omit). Never throws.
 */
export function parseCriteria(raw: unknown): SmartCriteria {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return {}
  }
  const obj = raw as Record<string, unknown>
  const result: SmartCriteria = {}

  if (typeof obj.titleContains === 'string') {
    const trimmed = obj.titleContains.trim()
    if (trimmed.length > 0) {
      result.titleContains = trimmed
    }
  }

  if (obj.starred === true) {
    result.starred = true
  }

  if ('folderId' in obj) {
    if (obj.folderId === null) {
      result.folderId = null
    } else if (typeof obj.folderId === 'string') {
      result.folderId = obj.folderId
    }
  }

  if (typeof obj.tagId === 'string') {
    const trimmed = obj.tagId.trim()
    if (trimmed.length > 0) {
      result.tagId = trimmed
    }
  }

  // Accept a number or a numeric string; keep only a positive integer.
  if (obj.updatedWithinDays !== undefined) {
    const n =
      typeof obj.updatedWithinDays === 'number'
        ? obj.updatedWithinDays
        : typeof obj.updatedWithinDays === 'string'
          ? Number(obj.updatedWithinDays)
          : Number.NaN
    if (Number.isInteger(n) && n > 0) {
      result.updatedWithinDays = n
    }
  }

  return result
}

/**
 * Human-readable one-line description, e.g. 'title contains "report" · starred'.
 * Empty criteria → 'all documents'.
 */
export function describeCriteria(c: SmartCriteria): string {
  const parts: string[] = []

  if (c.titleContains !== undefined) {
    parts.push(`title contains "${c.titleContains}"`)
  }

  if (c.starred === true) {
    parts.push('starred')
  }

  if ('folderId' in c) {
    if (c.folderId === null) {
      parts.push('in root folder')
    } else {
      parts.push(`in folder ${c.folderId}`)
    }
  }

  if (c.tagId !== undefined) {
    parts.push(`tagged ${c.tagId}`)
  }

  if (c.updatedWithinDays !== undefined) {
    parts.push(
      c.updatedWithinDays === 1
        ? 'updated in the last day'
        : `updated in the last ${c.updatedWithinDays} days`,
    )
  }

  return parts.length === 0 ? 'all documents' : parts.join(' · ')
}
