import { describe, expect, it } from 'vitest'
import { docMenuItems } from '@/lib/docs/context-actions'

describe('docMenuItems', () => {
  it('returns 9 items', () => {
    expect(docMenuItems({ starred: false })).toHaveLength(9)
  })

  it('star label is "Star" when not starred', () => {
    const items = docMenuItems({ starred: false })
    const star = items.find((i) => i.key === 'star')
    expect(star?.label).toBe('Star')
  })

  it('star label is "Unstar" when starred', () => {
    const items = docMenuItems({ starred: true })
    const star = items.find((i) => i.key === 'star')
    expect(star?.label).toBe('Unstar')
  })

  it('template item is enabled (G2 save-as-template)', () => {
    const items = docMenuItems({ starred: false })
    const template = items.find((i) => i.key === 'template')
    expect(template?.enabled).toBe(true)
    expect(template?.label).toBe('Save as template')
  })

  it('share item is disabled with a note', () => {
    const items = docMenuItems({ starred: false })
    const share = items.find((i) => i.key === 'share')
    expect(share?.enabled).toBe(false)
    expect(share?.note).toBeTruthy()
  })
})
