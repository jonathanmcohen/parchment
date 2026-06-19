export type SortKey = 'name' | 'modified' | 'created' | 'size'
export type SortDir = 'asc' | 'desc'

export interface SortableDoc {
  title: string
  updatedAt: string // ISO
  createdAt: string // ISO
  size: number
}

/**
 * Pure, stable sort returning a NEW array.
 * name→title (locale, case-insensitive),
 * modified→updatedAt, created→createdAt, size→size.
 * dir flips the comparison.
 * Ties broken by title then keeps input order (stable).
 */
export function sortDocs<T extends SortableDoc>(docs: T[], key: SortKey, dir: SortDir): T[] {
  const copy = docs.slice()

  copy.sort((a, b) => {
    let cmp = 0

    if (key === 'name') {
      cmp = a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
    } else if (key === 'modified') {
      cmp = a.updatedAt < b.updatedAt ? -1 : a.updatedAt > b.updatedAt ? 1 : 0
    } else if (key === 'created') {
      cmp = a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0
    } else {
      // size
      cmp = a.size - b.size
    }

    if (cmp === 0) {
      // Stable tie-break by title
      cmp = a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
    }

    return dir === 'desc' ? -cmp : cmp
  })

  return copy
}
