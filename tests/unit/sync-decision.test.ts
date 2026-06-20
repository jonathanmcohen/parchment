// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { classifyChange } from '@/lib/disk/sync-decision'

// F2: pure classification of an external file change from three hashes.
//   fileHash === syncedHash            → 'echo'   (our own write echoed back / no-op)
//   else dbHash === syncedHash         → 'apply'  (file changed, DB didn't → external edit)
//   else                               → 'conflict' (both diverged since last sync)

describe('classifyChange', () => {
  it('file equals synced hash → echo (wins over everything)', () => {
    // Even when the DB has also diverged, an unchanged file is still our echo.
    expect(classifyChange('A', 'B', 'A')).toBe('echo')
  })

  it('file changed but DB unchanged since sync → apply', () => {
    expect(classifyChange('B', 'A', 'A')).toBe('apply')
  })

  it('both file and DB diverged since sync → conflict', () => {
    expect(classifyChange('B', 'C', 'A')).toBe('conflict')
  })

  it('null syncedHash + file matches db → apply (first-time managed file)', () => {
    // syncedHash null is never-equal to any real hash, so not echo; dbHash !== null → apply.
    expect(classifyChange('A', 'A', null)).toBe('apply')
  })

  it('null syncedHash + file differs from db → conflict', () => {
    expect(classifyChange('B', 'A', null)).toBe('conflict')
  })

  it('undefined syncedHash behaves like null → apply when file matches db', () => {
    expect(classifyChange('A', 'A', undefined)).toBe('apply')
  })

  it('empty-string file equal to synced → echo', () => {
    expect(classifyChange('', 'X', '')).toBe('echo')
  })

  it('all three equal → echo', () => {
    expect(classifyChange('A', 'A', 'A')).toBe('echo')
  })
})
