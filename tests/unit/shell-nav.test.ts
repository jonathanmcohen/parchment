import { describe, expect, it } from 'vitest'
import {
  isNavRowActive,
  normalizeFilesView,
  userInitial,
} from '@/lib/shell/nav'

describe('isNavRowActive', () => {
  it('marks the exact route active', () => {
    expect(isNavRowActive('/files', '/files')).toBe(true)
    expect(isNavRowActive('/settings', '/settings')).toBe(true)
  })

  it('marks a nested route under the row prefix active', () => {
    // /settings/appearance should light the Settings row.
    expect(isNavRowActive('/settings/appearance', '/settings')).toBe(true)
    expect(isNavRowActive('/trash/anything', '/trash')).toBe(true)
  })

  it('does not light a sibling route that merely shares a string prefix', () => {
    // /files-archive must NOT match /files (prefix-boundary guard).
    expect(isNavRowActive('/files-archive', '/files')).toBe(false)
    expect(isNavRowActive('/settingsx', '/settings')).toBe(false)
  })

  it('does not light when the pathname is unrelated', () => {
    expect(isNavRowActive('/d/abc123', '/files')).toBe(false)
    expect(isNavRowActive('/files', '/settings')).toBe(false)
  })

  it('matches Files row for a query-string view of /files', () => {
    // usePathname() strips the query, so the bare path is what we receive; the
    // ?view=starred rows still resolve to the /files row being active.
    expect(isNavRowActive('/files', '/files')).toBe(true)
  })

  it('handles a null/empty pathname without throwing', () => {
    expect(isNavRowActive(null, '/files')).toBe(false)
    expect(isNavRowActive('', '/files')).toBe(false)
  })
})

describe('normalizeFilesView', () => {
  it('maps the routeless Drive views to the in-component view state', () => {
    expect(normalizeFilesView('recents')).toBe('recents')
    expect(normalizeFilesView('starred')).toBe('starred')
    expect(normalizeFilesView('shared')).toBe('shared')
  })

  it('maps "all" / "files" / null to the default all view', () => {
    expect(normalizeFilesView('all')).toBe('all')
    expect(normalizeFilesView('files')).toBe('all')
    expect(normalizeFilesView(null)).toBe('all')
    expect(normalizeFilesView(undefined)).toBe('all')
  })

  it('rejects unknown / routed views (trash is its own route, not a ?view=)', () => {
    // Trash and Files have dedicated routes; only the routeless views are
    // surfaced through ?view=. Anything unknown falls back to all.
    expect(normalizeFilesView('trash')).toBe('all')
    expect(normalizeFilesView('smart')).toBe('all')
    expect(normalizeFilesView('garbage')).toBe('all')
    expect(normalizeFilesView('')).toBe('all')
  })
})

describe('userInitial', () => {
  it('returns the uppercased first character of a name', () => {
    expect(userInitial('Jon')).toBe('J')
    expect(userInitial('alice')).toBe('A')
  })

  it('skips leading whitespace', () => {
    expect(userInitial('  bob')).toBe('B')
  })

  it('uses the first grapheme of a non-Latin name', () => {
    expect(userInitial('علي')).toBe('ع')
  })

  it('falls back to a neutral glyph for an empty / whitespace name', () => {
    expect(userInitial('')).toBe('?')
    expect(userInitial('   ')).toBe('?')
  })
})
