'use client'

import { useCallback, useEffect, useState } from 'react'
import type { FolderNode, TreeNode } from '@/lib/docs/folder-tree'
import { buildTree, folderPath } from '@/lib/docs/folder-tree'
import { describeCriteria, parseCriteria } from '@/lib/docs/smart-folder-criteria'

export type FolderDTO = {
  id: string
  name: string
  parentId: string | null
}

export type DocDTO = {
  id: string
  title: string
  updatedAt: string
  folderId?: string | null
  starred?: boolean
}

type SmartFolderDTO = {
  id: string
  name: string
  criteria: unknown
}

type View = 'all' | 'recents' | 'starred' | 'shared' | 'trash' | 'smart'

const VIEWS: { key: View; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'recents', label: 'Recents' },
  { key: 'starred', label: 'Starred' },
  { key: 'shared', label: 'Shared' },
  { key: 'trash', label: 'Trash' },
]

interface Props {
  initialFolders: FolderDTO[]
  initialDocs: DocDTO[]
}

// ─── Smart folder create form ─────────────────────────────────────────────────

interface SmartFolderCreateFormProps {
  onCreated: () => void
  onCancel: () => void
}

function SmartFolderCreateForm({ onCreated, onCancel }: SmartFolderCreateFormProps) {
  const [name, setName] = useState('')
  const [titleContains, setTitleContains] = useState('')
  const [starredOnly, setStarredOnly] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError('Name is required')
      return
    }
    const criteria: Record<string, unknown> = {}
    if (titleContains.trim()) criteria.titleContains = titleContains.trim()
    if (starredOnly) criteria.starred = true

    try {
      const res = await fetch('/api/smart-folders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), criteria }),
      })
      if (res.ok) {
        onCreated()
      } else {
        const data = (await res.json()) as { error?: string }
        setError(data.error ?? 'Failed to create smart folder')
      }
    } catch {
      setError('Failed to create smart folder')
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-2 p-3 border border-[var(--border)] rounded-md bg-[var(--paper)] mt-2"
    >
      <div className="flex flex-col gap-1">
        <label htmlFor="sf-name" className="text-xs font-medium text-[var(--foreground)]">
          Name
        </label>
        <input
          id="sf-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Smart folder name"
          className="px-2 py-1 text-sm border border-[var(--border)] rounded bg-[var(--background)] text-[var(--foreground)]"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="sf-title" className="text-xs font-medium text-[var(--foreground)]">
          Title contains
        </label>
        <input
          id="sf-title"
          type="text"
          value={titleContains}
          onChange={(e) => setTitleContains(e.target.value)}
          placeholder="e.g. report"
          className="px-2 py-1 text-sm border border-[var(--border)] rounded bg-[var(--background)] text-[var(--foreground)]"
        />
      </div>
      <div className="flex items-center gap-2">
        <input
          id="sf-starred"
          type="checkbox"
          checked={starredOnly}
          onChange={(e) => setStarredOnly(e.target.checked)}
          className="rounded"
        />
        <label htmlFor="sf-starred" className="text-xs font-medium text-[var(--foreground)]">
          Starred only
        </label>
      </div>
      {error !== null && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2 mt-1">
        <button
          type="submit"
          className="px-3 py-1 text-xs rounded bg-[var(--accent-contrast)] text-white font-medium"
        >
          Create
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1 text-xs rounded border border-[var(--border)] text-[var(--muted)]"
        >
          Cancel
        </button>
      </div>
    </form>
  )
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

// ─── Flat doc row (used in Recents / Starred / Trash views) ──────────────────

interface FlatDocRowProps {
  doc: DocDTO
  view: 'recents' | 'starred' | 'trash'
  onRefresh: () => void
}

function FlatDocRow({ doc, view, onRefresh }: FlatDocRowProps) {
  const handleStar = async () => {
    try {
      const res = await fetch(`/api/docs/${doc.id}/star`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ starred: !doc.starred }),
      })
      if (res.ok) onRefresh()
    } catch {
      // leave state unchanged
    }
  }

  const handleTrash = async () => {
    try {
      const res = await fetch(`/api/docs/${doc.id}/trash`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (res.ok) onRefresh()
    } catch {
      // leave state unchanged
    }
  }

  const handleRestore = async () => {
    try {
      const res = await fetch(`/api/docs/${doc.id}/restore`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (res.ok) onRefresh()
    } catch {
      // leave state unchanged
    }
  }

  const isStarred = doc.starred ?? false

  return (
    <li>
      <div className="flex items-center justify-between py-2 gap-2">
        <a
          href={`/d/${doc.id}`}
          className="flex-1 font-medium hover:text-[var(--accent-contrast)] truncate"
        >
          📄 {doc.title}
        </a>
        <time dateTime={doc.updatedAt} className="text-[var(--muted)] text-xs shrink-0">
          {new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(
            new Date(doc.updatedAt),
          )}
        </time>
        {view !== 'trash' && (
          <>
            <button
              type="button"
              onClick={handleStar}
              aria-label={isStarred ? `Unstar ${doc.title}` : `Star ${doc.title}`}
              className="text-base leading-none px-1 shrink-0 hover:text-[var(--accent-contrast)]"
            >
              {isStarred ? '★' : '☆'}
            </button>
            <button
              type="button"
              onClick={handleTrash}
              aria-label={`Move ${doc.title} to trash`}
              className="text-xs px-2 py-1 rounded border border-[var(--border)] text-[var(--muted)] hover:text-red-600 hover:border-red-400 shrink-0"
            >
              🗑 Trash
            </button>
          </>
        )}
        {view === 'trash' && (
          <button
            type="button"
            onClick={handleRestore}
            aria-label={`Restore ${doc.title}`}
            className="text-xs px-2 py-1 rounded border border-[var(--border)] text-[var(--muted)] hover:text-[var(--accent-contrast)] hover:border-[var(--accent-contrast)] shrink-0"
          >
            Restore
          </button>
        )}
      </div>
    </li>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function FileManager({ initialFolders, initialDocs }: Props) {
  const [view, setView] = useState<View>('all')
  const [folders, setFolders] = useState<FolderDTO[]>(initialFolders)
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [docs, setDocs] = useState<DocDTO[]>(initialDocs)
  const [flatDocs, setFlatDocs] = useState<DocDTO[]>([])
  const [smartFolders, setSmartFolders] = useState<SmartFolderDTO[]>([])
  const [activeSmartId, setActiveSmartId] = useState<string | null>(null)
  const [smartDocs, setSmartDocs] = useState<DocDTO[]>([])
  const [showCreateForm, setShowCreateForm] = useState(false)

  // Fetch docs for the All view (current folder)
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

  // Fetch flat docs for Recents / Starred / Trash views
  const fetchFlatDocs = useCallback(async (v: 'recents' | 'starred' | 'trash') => {
    try {
      const res = await fetch(`/api/docs?view=${v}`)
      if (res.ok) {
        const data = (await res.json()) as DocDTO[]
        setFlatDocs(data)
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

  // Fetch smart folders
  const fetchSmartFolders = useCallback(async () => {
    try {
      const res = await fetch('/api/smart-folders')
      if (res.ok) {
        const data = (await res.json()) as SmartFolderDTO[]
        setSmartFolders(data)
      }
    } catch {
      // leave state unchanged
    }
  }, [])

  // Fetch results for the active smart folder
  const fetchSmartResults = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/smart-folders/${id}/results`)
      if (res.ok) {
        const data = (await res.json()) as DocDTO[]
        setSmartDocs(data)
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

  // When switching to a flat view, fetch that view's docs
  useEffect(() => {
    if (view === 'recents' || view === 'starred' || view === 'trash') {
      fetchFlatDocs(view)
    }
  }, [view, fetchFlatDocs])

  // Fetch smart folders on mount
  useEffect(() => {
    fetchSmartFolders()
  }, [fetchSmartFolders])

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
  const subfolders = folders.filter((f) => f.parentId === currentFolderId)
  const breadcrumb = currentFolderId ? folderPath(folders as FolderNode[], currentFolderId) : []
  const onDropped = () => refreshAll(currentFolderId)

  const handleFlatRefresh = useCallback(() => {
    if (view === 'recents' || view === 'starred' || view === 'trash') {
      fetchFlatDocs(view)
    }
  }, [view, fetchFlatDocs])

  return (
    <div className="flex flex-col gap-4 h-full min-h-0">
      {/* View switcher tab bar */}
      <nav aria-label="views" className="flex gap-1 border-b border-[var(--border)] pb-2">
        {VIEWS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setView(key)
              setActiveSmartId(null)
            }}
            aria-current={view === key && view !== 'smart' ? 'page' : undefined}
            className={[
              'px-3 py-1.5 text-sm rounded-t font-medium',
              view === key && view !== 'smart'
                ? 'text-[var(--accent-contrast)] border-b-2 border-[var(--accent-contrast)]'
                : 'text-[var(--muted)] hover:text-[var(--foreground)]',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </nav>

      {/* View content */}
      {(view === 'all' || view === 'smart') && (
        <div className="flex gap-6 flex-1 min-h-0">
          {/* Left rail — folder tree + smart folders */}
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

            {/* Smart Folders section */}
            <div className="mt-4 flex flex-col gap-1">
              <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide px-1">
                Smart Folders
              </p>
              <ul className="flex flex-col gap-0.5">
                {smartFolders.map((sf) => (
                  <li key={sf.id} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setView('smart')
                        setActiveSmartId(sf.id)
                        fetchSmartResults(sf.id)
                      }}
                      className={[
                        'flex-1 text-left px-2 py-1 text-sm rounded truncate',
                        view === 'smart' && activeSmartId === sf.id
                          ? 'font-semibold text-[var(--accent-contrast)]'
                          : 'text-[var(--foreground)] hover:text-[var(--accent-contrast)]',
                      ].join(' ')}
                    >
                      🔍 {sf.name}
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete smart folder ${sf.name}`}
                      onClick={async () => {
                        try {
                          const res = await fetch(`/api/smart-folders/${sf.id}`, {
                            method: 'DELETE',
                          })
                          if (res.ok) {
                            if (activeSmartId === sf.id) {
                              setView('all')
                              setActiveSmartId(null)
                            }
                            await fetchSmartFolders()
                          }
                        } catch {
                          // leave state unchanged
                        }
                      }}
                      className="text-xs text-[var(--muted)] hover:text-red-600 px-1 shrink-0"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => setShowCreateForm((v) => !v)}
                className="text-xs text-[var(--muted)] hover:text-[var(--accent-contrast)] text-left px-2 py-1"
              >
                + Smart folder
              </button>
              {showCreateForm && (
                <SmartFolderCreateForm
                  onCreated={async () => {
                    await fetchSmartFolders()
                    setShowCreateForm(false)
                  }}
                  onCancel={() => setShowCreateForm(false)}
                />
              )}
            </div>
          </aside>

          {/* Main panel */}
          <main className="flex-1 min-w-0">
            {view === 'all' && (
              <>
                {/* Breadcrumb */}
                <nav
                  aria-label="folder path"
                  className="flex items-center gap-1 text-sm mb-4 flex-wrap"
                >
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
              </>
            )}

            {view === 'smart' &&
              activeSmartId !== null &&
              (() => {
                const sf = smartFolders.find((s) => s.id === activeSmartId)
                const criteria = parseCriteria(sf?.criteria)
                return (
                  <>
                    <div className="mb-4">
                      <h2 className="text-base font-semibold text-[var(--foreground)]">
                        {sf?.name ?? 'Smart Folder'}
                      </h2>
                      <p className="text-xs text-[var(--muted)] mt-0.5">
                        {describeCriteria(criteria)}
                      </p>
                    </div>
                    {smartDocs.length === 0 ? (
                      <p className="text-[var(--muted)]">No documents match this smart folder.</p>
                    ) : (
                      <ul className="divide-y divide-[var(--border)]">
                        {smartDocs.map((doc) => (
                          <FlatDocRow
                            key={doc.id}
                            doc={doc}
                            view="recents"
                            onRefresh={() => {
                              if (activeSmartId !== null) fetchSmartResults(activeSmartId)
                            }}
                          />
                        ))}
                      </ul>
                    )}
                  </>
                )
              })()}
          </main>
        </div>
      )}

      {(view === 'recents' || view === 'starred' || view === 'trash') && (
        <main className="flex-1 min-w-0">
          {flatDocs.length === 0 ? (
            <p className="text-[var(--muted)]">
              {view === 'trash' ? 'Trash is empty.' : 'Nothing here yet.'}
            </p>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {flatDocs.map((doc) => (
                <FlatDocRow key={doc.id} doc={doc} view={view} onRefresh={handleFlatRefresh} />
              ))}
            </ul>
          )}
        </main>
      )}

      {view === 'shared' && (
        <main className="flex-1 min-w-0 flex items-center justify-center">
          <p className="text-[var(--muted)] text-center">
            Shared documents arrive in v0.2. Parchment v0.1 is single-owner.
          </p>
        </main>
      )}
    </div>
  )
}
