import { describe, expect, it } from 'vitest'
import { filterSlashItems, SLASH_CATEGORIES, SLASH_ITEMS } from '@/lib/editor/slash-items'

describe('B12 slash menu catalog', () => {
  // ── Category metadata ──────────────────────────────────────────────────

  it('SLASH_CATEGORIES has exactly 6 values', () => {
    expect(SLASH_CATEGORIES).toHaveLength(6)
  })

  it('SLASH_CATEGORIES contains exactly the expected names', () => {
    expect(SLASH_CATEGORIES).toEqual(
      expect.arrayContaining(['BASIC', 'TEXT', 'LISTS', 'MEDIA', 'EMBED', 'ADVANCED']),
    )
    // And nothing else
    expect(SLASH_CATEGORIES).toHaveLength(6)
  })

  it('every SLASH_CATEGORIES value appears on at least one SLASH_ITEMS entry', () => {
    for (const cat of SLASH_CATEGORIES) {
      const found = SLASH_ITEMS.some((item) => item.category === cat)
      expect(found, `category ${cat} has no items`).toBe(true)
    }
  })

  // ── filterSlashItems ───────────────────────────────────────────────────

  it('empty query returns all items', () => {
    const result = filterSlashItems('')
    expect(result).toEqual(SLASH_ITEMS)
  })

  it('"tab" matches Table item (keyword match)', () => {
    const result = filterSlashItems('tab')
    const ids = result.map((i) => i.id)
    expect(ids).toContain('table')
  })

  it('"head" matches Heading 1, Heading 2, and Heading 3 (keyword match)', () => {
    const result = filterSlashItems('head')
    const ids = result.map((i) => i.id)
    expect(ids).toContain('heading1')
    expect(ids).toContain('heading2')
    expect(ids).toContain('heading3')
  })

  it('"xyzzy" returns empty array', () => {
    expect(filterSlashItems('xyzzy')).toHaveLength(0)
  })

  it('matching is case-insensitive — "HEADING" finds headings', () => {
    const result = filterSlashItems('HEADING')
    const ids = result.map((i) => i.id)
    expect(ids).toContain('heading1')
  })

  it('"quote" finds blockquote (title match)', () => {
    const result = filterSlashItems('quote')
    const ids = result.map((i) => i.id)
    expect(ids).toContain('blockquote')
  })

  it('"code" finds code block (title match)', () => {
    const result = filterSlashItems('code')
    const ids = result.map((i) => i.id)
    expect(ids).toContain('codeBlock')
  })

  it('"task" finds task list (keyword match)', () => {
    const result = filterSlashItems('task')
    const ids = result.map((i) => i.id)
    expect(ids).toContain('taskList')
  })

  it('"image" finds image (title match)', () => {
    const result = filterSlashItems('image')
    const ids = result.map((i) => i.id)
    expect(ids).toContain('image')
  })

  it('"toc" finds table of contents (keyword match)', () => {
    const result = filterSlashItems('toc')
    const ids = result.map((i) => i.id)
    expect(ids).toContain('toc')
  })

  it('"fn" finds footnote (keyword match)', () => {
    const result = filterSlashItems('fn')
    const ids = result.map((i) => i.id)
    expect(ids).toContain('footnote')
  })

  it('"divider" finds horizontal rule (keyword match)', () => {
    const result = filterSlashItems('divider')
    const ids = result.map((i) => i.id)
    expect(ids).toContain('horizontalRule')
  })

  it('"list" finds bulleted and numbered lists', () => {
    const result = filterSlashItems('list')
    const ids = result.map((i) => i.id)
    expect(ids).toContain('bulletList')
    expect(ids).toContain('orderedList')
  })

  // ── Type structure ────────────────────────────────────────────────────

  it('every item has required fields: id, title, category, keywords', () => {
    for (const item of SLASH_ITEMS) {
      expect(typeof item.id).toBe('string')
      expect(item.id.length).toBeGreaterThan(0)
      expect(typeof item.title).toBe('string')
      expect(SLASH_CATEGORIES).toContain(item.category)
      expect(Array.isArray(item.keywords)).toBe(true)
    }
  })

  it('all item ids are unique', () => {
    const ids = SLASH_ITEMS.map((i) => i.id)
    const unique = new Set(ids)
    expect(unique.size).toBe(ids.length)
  })
})
