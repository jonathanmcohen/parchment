export interface FolderNode {
  id: string
  name: string
  parentId: string | null
}

export interface TreeNode extends FolderNode {
  children: TreeNode[]
}

/**
 * Build a nested tree from a flat folder list. Roots = parentId null OR a
 * parentId not present in the set (defensive). Children sorted by name (locale,
 * case-insensitive), then id. Orphan-safe (a missing parent → treated as root).
 */
export function buildTree(folders: FolderNode[]): TreeNode[] {
  const knownIds = new Set(folders.map((f) => f.id))
  const nodeMap = new Map<string, TreeNode>()

  for (const f of folders) {
    nodeMap.set(f.id, { ...f, children: [] })
  }

  const roots: TreeNode[] = []

  for (const f of folders) {
    const node = nodeMap.get(f.id)
    if (!node) continue
    if (f.parentId === null || !knownIds.has(f.parentId)) {
      roots.push(node)
    } else {
      const parent = nodeMap.get(f.parentId)
      if (parent) {
        parent.children.push(node)
      } else {
        roots.push(node)
      }
    }
  }

  const sortNodes = (nodes: TreeNode[]): void => {
    nodes.sort((a, b) => {
      const cmp = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      return cmp !== 0 ? cmp : a.id.localeCompare(b.id)
    })
    for (const n of nodes) sortNodes(n.children)
  }

  sortNodes(roots)
  return roots
}

/**
 * Ancestor chain root→folder (inclusive) for `id`, or [] if id not found.
 * e.g. for /A/B/C returns [A,B,C]. Cycle-safe (bail if a node repeats).
 */
export function folderPath(folders: FolderNode[], id: string): FolderNode[] {
  const byId = new Map(folders.map((f) => [f.id, f]))
  const target = byId.get(id)
  if (!target) return []

  const chain: FolderNode[] = []
  const visited = new Set<string>()
  let current: FolderNode | undefined = target

  while (current) {
    if (visited.has(current.id)) break
    visited.add(current.id)
    chain.unshift(current)
    if (current.parentId === null) break
    current = byId.get(current.parentId)
  }

  return chain
}

/**
 * True if moving `folderId` under `newParentId` would create a cycle —
 * i.e. newParentId === folderId OR newParentId is a descendant of folderId.
 * newParentId null (→ root) is always safe. Cycle-safe traversal.
 */
export function wouldCreateCycle(
  folders: FolderNode[],
  folderId: string,
  newParentId: string | null,
): boolean {
  if (newParentId === null) return false
  if (newParentId === folderId) return true

  const byId = new Map(folders.map((f) => [f.id, f]))
  const visited = new Set<string>()
  let current: FolderNode | undefined = byId.get(newParentId)

  while (current) {
    if (visited.has(current.id)) break
    visited.add(current.id)
    if (current.parentId === folderId) return true
    if (current.parentId === null) break
    current = byId.get(current.parentId)
  }

  return false
}
