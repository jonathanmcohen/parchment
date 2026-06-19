// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { buildTree, folderPath, wouldCreateCycle } from '@/lib/docs/folder-tree'
import type { FolderNode } from '@/lib/docs/folder-tree'

const f = (id: string, name: string, parentId: string | null = null): FolderNode => ({
  id,
  name,
  parentId,
})

describe('buildTree', () => {
  it('builds a 2-level nested tree', () => {
    const folders = [f('root', 'Root'), f('child', 'Child', 'root')]
    const tree = buildTree(folders)
    expect(tree).toHaveLength(1)
    expect(tree[0]?.id).toBe('root')
    expect(tree[0]?.children).toHaveLength(1)
    expect(tree[0]?.children[0]?.id).toBe('child')
  })

  it('builds a 3-level nested tree', () => {
    const folders = [
      f('a', 'A'),
      f('b', 'B', 'a'),
      f('c', 'C', 'b'),
    ]
    const tree = buildTree(folders)
    expect(tree[0]?.children[0]?.children[0]?.id).toBe('c')
  })

  it('sorts children by name locale case-insensitive, then id', () => {
    const folders = [
      f('root', 'Root'),
      f('z1', 'Zebra', 'root'),
      f('a1', 'apple', 'root'),
      f('a2', 'Apple', 'root'),
    ]
    const tree = buildTree(folders)
    const names = tree[0]?.children.map((c) => c.name) ?? []
    // apple / Apple first (case-insensitive equal → sort by id: a1 < a2), then Zebra
    expect(names[0]).toBe('apple')
    expect(names[1]).toBe('Apple')
    expect(names[2]).toBe('Zebra')
  })

  it('handles multiple roots', () => {
    const folders = [f('a', 'A'), f('b', 'B')]
    const tree = buildTree(folders)
    expect(tree).toHaveLength(2)
  })

  it('treats orphan folders (parentId references unknown id) as roots', () => {
    const folders = [f('child', 'Child', 'nonexistent')]
    const tree = buildTree(folders)
    expect(tree).toHaveLength(1)
    expect(tree[0]?.id).toBe('child')
  })

  it('returns empty array for empty input', () => {
    expect(buildTree([])).toEqual([])
  })
})

describe('folderPath', () => {
  const folders = [
    f('a', 'A'),
    f('b', 'B', 'a'),
    f('c', 'C', 'b'),
  ]

  it('returns root→leaf chain', () => {
    const path = folderPath(folders, 'c')
    expect(path.map((n) => n.id)).toEqual(['a', 'b', 'c'])
  })

  it('returns [] for unknown id', () => {
    expect(folderPath(folders, 'unknown')).toEqual([])
  })

  it('returns single-element array for root node', () => {
    const path = folderPath(folders, 'a')
    expect(path).toHaveLength(1)
    expect(path[0]?.id).toBe('a')
  })

  it('is cycle-safe', () => {
    // Introduce a cycle: a→b→a
    const cyclic = [
      { id: 'a', name: 'A', parentId: 'b' },
      { id: 'b', name: 'B', parentId: 'a' },
    ]
    const path = folderPath(cyclic, 'a')
    expect(path.length).toBeGreaterThan(0)
  })
})

describe('wouldCreateCycle', () => {
  // Tree: root → child → grandchild; also unrelated sibling at root level
  const folders = [
    f('root', 'Root'),
    f('child', 'Child', 'root'),
    f('grandchild', 'Grandchild', 'child'),
    f('sibling', 'Sibling'),
  ]

  it('returns true when folderId === newParentId (self)', () => {
    expect(wouldCreateCycle(folders, 'root', 'root')).toBe(true)
  })

  it('returns true when newParentId is a direct child of folderId', () => {
    expect(wouldCreateCycle(folders, 'root', 'child')).toBe(true)
  })

  it('returns true when newParentId is a transitive descendant of folderId', () => {
    expect(wouldCreateCycle(folders, 'root', 'grandchild')).toBe(true)
  })

  it('returns false for an unrelated sibling', () => {
    expect(wouldCreateCycle(folders, 'root', 'sibling')).toBe(false)
  })

  it('returns false when newParentId is null (move to root)', () => {
    expect(wouldCreateCycle(folders, 'root', null)).toBe(false)
  })

  it('returns false when moving to an actual ancestor (valid up-move)', () => {
    // Moving grandchild under root is fine
    expect(wouldCreateCycle(folders, 'grandchild', 'root')).toBe(false)
  })
})
