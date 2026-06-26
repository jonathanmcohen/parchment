import { describe, expect, it } from 'vitest'
import { isNavRowActive, normalizeFilesView, userInitial } from '@/lib/shell/nav'

describe('isNavRowActive', () => {
  it('marks the exact route active', () => {
    expect(isNavRowActive('/files', '/files')).toBe(true)
    expect(isNavRowActive('/settings', '/settings')).toBe(true)
  })

  it('marks a nested route under the row prefix active', () => {
    // /settings/appearance should light the Settings row.
    expect(isNavRowActive('/settings/appearance', '/settings')).toBe(true)
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

  it('handles a null/empty pathname without throwing', () => {
    expect(isNavRowActive(null, '/files')).toBe(false)
    expect(isNavRowActive('', '/files')).toBe(false)
  })

  describe('query-aware Files-route views (the routeless ?view= rows)', () => {
    it('lights only the bare Files row on /files with no view', () => {
      // Bare /files (the "all" view) → Files row active, the ?view= rows NOT.
      expect(isNavRowActive('/files', '/files', null)).toBe(true)
      expect(isNavRowActive('/files', '/files?view=shared', null)).toBe(false)
      expect(isNavRowActive('/files', '/files?view=starred', null)).toBe(false)
      expect(isNavRowActive('/files', '/files?view=recents', null)).toBe(false)
    })

    it('treats view=all (or unknown) the same as the bare Files row', () => {
      expect(isNavRowActive('/files', '/files', 'all')).toBe(true)
      expect(isNavRowActive('/files', '/files', 'bogus')).toBe(true)
      // and the ?view= rows stay inactive under view=all
      expect(isNavRowActive('/files', '/files?view=shared', 'all')).toBe(false)
    })

    it('lights the Shared row (and ONLY it) on ?view=shared', () => {
      expect(isNavRowActive('/files', '/files?view=shared', 'shared')).toBe(true)
      // the bare Files row must NOT light under ?view=shared (the bug being fixed)
      expect(isNavRowActive('/files', '/files', 'shared')).toBe(false)
      expect(isNavRowActive('/files', '/files?view=starred', 'shared')).toBe(false)
      expect(isNavRowActive('/files', '/files?view=recents', 'shared')).toBe(false)
    })

    it('lights the Starred row (and ONLY it) on ?view=starred', () => {
      expect(isNavRowActive('/files', '/files?view=starred', 'starred')).toBe(true)
      expect(isNavRowActive('/files', '/files', 'starred')).toBe(false)
      expect(isNavRowActive('/files', '/files?view=shared', 'starred')).toBe(false)
      expect(isNavRowActive('/files', '/files?view=recents', 'starred')).toBe(false)
    })

    it('lights the Recents row (and ONLY it) on ?view=recents', () => {
      expect(isNavRowActive('/files', '/files?view=recents', 'recents')).toBe(true)
      expect(isNavRowActive('/files', '/files', 'recents')).toBe(false)
      expect(isNavRowActive('/files', '/files?view=shared', 'recents')).toBe(false)
      expect(isNavRowActive('/files', '/files?view=starred', 'recents')).toBe(false)
    })

    it('lights the Trash row (and ONLY it) on ?view=trash', () => {
      expect(isNavRowActive('/files', '/files?view=trash', 'trash')).toBe(true)
      expect(isNavRowActive('/files', '/files', 'trash')).toBe(false)
      expect(isNavRowActive('/files', '/files?view=shared', 'trash')).toBe(false)
      expect(isNavRowActive('/files', '/files?view=starred', 'trash')).toBe(false)
    })

    it('keeps exactly one active row across every files view', () => {
      const fileRows = [
        '/files',
        '/files?view=recents',
        '/files?view=shared',
        '/files?view=starred',
        '/files?view=trash',
      ]
      for (const view of [null, 'all', 'recents', 'shared', 'starred', 'trash']) {
        const activeCount = fileRows.filter((href) => isNavRowActive('/files', href, view)).length
        expect(activeCount).toBe(1)
      }
    })

    it('non-files rows ignore the view param', () => {
      // The view param is meaningless off /files — Settings still matches on
      // path alone regardless of any stray ?view=.
      expect(isNavRowActive('/settings', '/settings', 'starred')).toBe(true)
    })
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

  it('maps trash to the trash view (now a routeless ?view= like recents/starred/shared)', () => {
    expect(normalizeFilesView('trash')).toBe('trash')
  })

  it('rejects unknown views', () => {
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
