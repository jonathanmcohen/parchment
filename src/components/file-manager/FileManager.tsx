'use client'

import { useCallback, useEffect, useState } from 'react'
import type { FolderNode, TreeNode } from '@/lib/docs/folder-tree'
import { buildTree, folderPath } from '@/lib/docs/folder-tree'

export type FolderDTO = {
  id: string
  name: string
  parentId: string | null
}

export type DocDTO = {
  id: string
  title: string
  updatedAt: string
  folderId: string | null
}

interface Props {
  initialFolders: FolderDTO[]
  initialDocs: DocDTO[]
}

// ─── Drag data ───────────────────────────────────────────────────────────────

type DragPayload = { type: 'folder'; id: string } | { type: 'doc'; id: string }

function setDrag(e: React.DragEvent, payload: DragPayload) {
  e.dataTransfer.setData('application/json', JSON.stringify(payload))
  e.dataTransfer.effectAllowed = 'move'
}

function getDrag(e: React.DragEvent): DragPayload | null {
  try {
    const raw = e.dataTransfer.getData('application/json')
    return raw ? (JSON.parse(raw) as DragPayload) : null
  } catch {
    return null
  }
}

// ─── Drop handler ─────────────────────────────────────────────────────────────

async function handleDrop(
  payload: DragPayload,
  targetFolderId: string | null,
  onSuccess: () => void,
): Promise<void> {
  if (payload.type === 'doc') {
    try {
      const res = await fetch(`/api/docs/${payload.id}/move`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ folderId: targetFolderId }),
      })
      if (res.ok) onSuccess()
    } catch {
      // leave state unchanged
    }
  } else {
    try {
      const res = await fetch(`/api/folders/${payload.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ parentId: targetFolderId }),
      })
      if (res.status === 409) {
        window.alert("Can't move a folder into itself")
        return
      }
      if (res.ok) onSuccess()
    } catch {
      // leave state unchanged
    }
  }
}

// ─── Drop zone hook ───────────────────────────────────────────────────────────

interface DropZoneProps {
  targetFolderId: string | null
  onDropped: () => void
  children: (over: boolean, handlers: DropHandlers) => React.ReactNode
}

interface DropHandlers {
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: () => void
  onDrop: (e: React.DragEvent) => void
}

function DropZone({ targetFolderId, onDropped, children }: DropZoneProps) {
  const [over, setOver] = useState(false)
  const handlers: DropHandlers = {
    onDragOver: (e) => {
      e.preventDefault()
      setOver(true)
    },
    onDragLeave: () => setOver(false),
    onDrop: (e) => {
      e.preventDefault()
      setOver(false)
      const payload = getDrag(e)
      if (payload) handleDrop(payload, targetFolderId, onDropped)
    },
  }
  return <>{children(over, handlers)}</>
}

// ─── Tree node component ──────────────────────────────────────────────────────

interface FolderTreeItemProps {
  node: TreeNode
  depth: number
  currentFolderId: string | null
  onSelect: (id: string) => void
  onDropped: () => void
}

function FolderTreeItem({
  node,
  depth,
  currentFolderId,
  onSelect,
  onDropped,
}: FolderTreeItemProps) {
  const isActive = currentFolderId === node.id

  return (
    <li>
      <DropZone targetFolderId={node.id} onDropped={onDropped}>
        {(over, handlers) => (
          <button
            type="button"
            draggable
            onDragStart={(e) => setDrag(e, { type: 'folder', id: node.id })}
            onDragOver={handlers.onDragOver}
            onDragLeave={handlers.onDragLeave}
            onDrop={handlers.onDrop}
            onClick={() => onSelect(node.id)}
            style={{ paddingLeft: `${depth * 16}px` }}
            className={[
              'flex w-full items-center text-left px-2 py-1 text-sm rounded truncate',
              over
                ? 'bg-[var(--accent-contrast)] text-white'
                : isActive
                  ? 'font-semibold text-[var(--accent-contrast)]'
                  : 'text-[var(--foreground)] hover:text-[var(--accent-contrast)]',
            ].join(' ')}
          >
            📁 {node.name}
          </button>
        )}
      </DropZone>
      {node.children.length > 0 && (
        <ul>
          {node.children.map((child) => (
            <FolderTreeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              currentFolderId={currentFolderId}
              onSelect={onSelect}
              onDropped={onDropped}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function FileManager({ initialFolders, initialDocs }: Props) {
  const [folders, setFolders] = useState<FolderDTO[]>(initialFolders)
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [docs, setDocs] = useState<DocDTO[]>(initialDocs)

  // Fetch docs for the current folder
  const fetchDocs = useCallback(async (folderId: string | null) => {
    const param = folderId ?? 'root'
    try {
      const res = await fetch(`/api/docs?folder=${param}`)
      if (res.ok) {
        const data = (await res.json()) as DocDTO[]
        setDocs(data)
      }
    } catch {
      // leave state unchanged
    }
  }, [])

  // Fetch all folders
  const fetchFolders = useCallback(async () => {
    try {
      const res = await fetch('/api/folders')
      if (res.ok) {
        const data = (await res.json()) as FolderDTO[]
        setFolders(data)
      }
    } catch {
      // leave state unchanged
    }
  }, [])

  const refreshAll = useCallback(
    async (folderId: string | null) => {
      await Promise.all([fetchFolders(), fetchDocs(folderId)])
    },
    [fetchFolders, fetchDocs],
  )

  const navigateTo = useCallback(
    (folderId: string | null) => {
      setCurrentFolderId(folderId)
      fetchDocs(folderId)
    },
    [fetchDocs],
  )

  // On mount, docs are already passed in as initialDocs (root)
  useEffect(() => {
    // nothing — initial data comes from SSR props
  }, [])

  const handleNewFolder = async () => {
    const name = window.prompt('Folder name')
    if (!name?.trim()) return
    try {
      const res = await fetch('/api/folders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), parentId: currentFolderId }),
      })
      if (res.ok) {
        await fetchFolders()
      }
    } catch {
      // leave state unchanged
    }
  }

  const tree = buildTree(folders as FolderNode[])

  // Folders that are direct children of currentFolderId
  const subfolders = folders.filter((f) => f.parentId === currentFolderId)

  const breadcrumb = currentFolderId ? folderPath(folders as FolderNode[], currentFolderId) : []

  const onDropped = () => refreshAll(currentFolderId)

  return (
    <div className="flex gap-6 h-full min-h-0">
      {/* Left rail — folder tree */}
      <aside className="w-56 shrink-0 border-r border-[var(--border)] pr-4 flex flex-col gap-2">
        <button
          type="button"
          onClick={handleNewFolder}
          className="rounded-md bg-[var(--accent-contrast)] px-3 py-1.5 font-medium text-sm text-white"
        >
          + New folder
        </button>

        {/* Root drop zone */}
        <DropZone targetFolderId={null} onDropped={onDropped}>
          {(over, handlers) => (
            <button
              type="button"
              onDragOver={handlers.onDragOver}
              onDragLeave={handlers.onDragLeave}
              onDrop={handlers.onDrop}
              onClick={() => navigateTo(null)}
              className={[
                'rounded px-2 py-1 text-sm text-left w-full',
                over
                  ? 'bg-[var(--accent-contrast)] text-white'
                  : currentFolderId === null
                    ? 'font-semibold text-[var(--foreground)]'
                    : 'text-[var(--muted)]',
              ].join(' ')}
            >
              🏠 Root
            </button>
          )}
        </DropZone>

        <ul className="flex flex-col gap-0.5">
          {tree.map((node) => (
            <FolderTreeItem
              key={node.id}
              node={node}
              depth={0}
              currentFolderId={currentFolderId}
              onSelect={(id) => navigateTo(id)}
              onDropped={onDropped}
            />
          ))}
        </ul>
      </aside>

      {/* Main panel */}
      <main className="flex-1 min-w-0">
        {/* Breadcrumb */}
        <nav aria-label="folder path" className="flex items-center gap-1 text-sm mb-4 flex-wrap">
          <button
            type="button"
            onClick={() => navigateTo(null)}
            className="text-[var(--accent-contrast)] hover:underline"
          >
            Root
          </button>
          {breadcrumb.map((segment) => (
            <span key={segment.id} className="flex items-center gap-1">
              <span className="text-[var(--muted)]" aria-hidden="true">
                /
              </span>
              <button
                type="button"
                onClick={() => navigateTo(segment.id)}
                className="text-[var(--accent-contrast)] hover:underline"
              >
                {segment.name}
              </button>
            </span>
          ))}
        </nav>

        {/* Content list */}
        {subfolders.length === 0 && docs.length === 0 ? (
          <p className="text-[var(--muted)]">This folder is empty.</p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {/* Subfolder rows */}
            {subfolders.map((folder) => (
              <li key={folder.id}>
                <DropZone targetFolderId={folder.id} onDropped={onDropped}>
                  {(over, handlers) => (
                    <button
                      type="button"
                      draggable
                      onDragStart={(e) => setDrag(e, { type: 'folder', id: folder.id })}
                      onDragOver={handlers.onDragOver}
                      onDragLeave={handlers.onDragLeave}
                      onDrop={handlers.onDrop}
                      onClick={() => navigateTo(folder.id)}
                      className={[
                        'flex w-full items-center gap-2 py-2 rounded font-medium text-left',
                        over
                          ? 'bg-[var(--paper)] text-[var(--accent-contrast)]'
                          : 'hover:text-[var(--accent-contrast)]',
                      ].join(' ')}
                    >
                      <span aria-hidden="true">📁</span>
                      {folder.name}
                    </button>
                  )}
                </DropZone>
              </li>
            ))}

            {/* Document rows */}
            {docs.map((doc) => (
              <li key={doc.id}>
                <div className="flex items-center justify-between py-2">
                  <a
                    href={`/d/${doc.id}`}
                    draggable
                    onDragStart={(e) => setDrag(e, { type: 'doc', id: doc.id })}
                    className="flex-1 font-medium hover:text-[var(--accent-contrast)]"
                  >
                    📄 {doc.title}
                  </a>
                  <time
                    dateTime={doc.updatedAt}
                    className="text-[var(--muted)] text-xs shrink-0 ml-4"
                  >
                    {new Intl.DateTimeFormat('en', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }).format(new Date(doc.updatedAt))}
                  </time>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
