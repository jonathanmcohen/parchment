'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { SortDir, SortKey } from '@/lib/docs/doc-sort'
import { sortDocs } from '@/lib/docs/doc-sort'
import type { FolderNode, TreeNode } from '@/lib/docs/folder-tree'
import { buildTree, folderPath } from '@/lib/docs/folder-tree'
import { rangeBetween, toggle as toggleSelection } from '@/lib/docs/selection'
import { describeCriteria, parseCriteria } from '@/lib/docs/smart-folder-criteria'
import { resolveTagColor, TAG_COLORS } from '@/lib/docs/tag-colors'

export type FolderDTO = {
  id: string
  name: string
  parentId: string | null
}

export type DocDTO = {
  id: string
  title: string
  updatedAt: string
  createdAt: string
  folderId?: string | null
  starred?: boolean
  size: number
  preview: string
}

type SmartFolderDTO = {
  id: string
  name: string
  criteria: unknown
}

type TagDTO = {
  id: string
  name: string
  color: string
  count: number
}

type DocTagDTO = {
  id: string
  name: string
  color: string
}

type View = 'all' | 'recents' | 'starred' | 'shared' | 'trash' | 'smart' | 'tag'
type ViewMode = 'list' | 'grid' | 'details'

const VIEWS: { key: View; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'recents', label: 'Recents' },
  { key: 'starred', label: 'Starred' },
  { key: 'shared', label: 'Shared' },
  { key: 'trash', label: 'Trash' },
]

const SORT_KEYS: { key: SortKey; label: string }[] = [
  { key: 'modified', label: 'Modified' },
  { key: 'name', label: 'Name' },
  { key: 'created', label: 'Created' },
  { key: 'size', label: 'Size' },
]

const LS_SORT_KEY = 'parchment.fm.sortKey'
const LS_SORT_DIR = 'parchment.fm.sortDir'
const LS_VIEW_MODE = 'parchment.fm.viewMode'

function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function lsSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // ignore
  }
}

function formatSize(chars: number): string {
  if (chars < 1000) return `${chars}`
  return `${(chars / 1000).toFixed(1)}k`
}

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

// ─── Tag create form ──────────────────────────────────────────────────────────

interface TagCreateFormProps {
  onCreated: () => void
  onCancel: () => void
}

function TagCreateForm({ onCreated, onCancel }: TagCreateFormProps) {
  const [name, setName] = useState('')
  const [color, setColor] = useState('slate')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError('Name is required')
      return
    }
    try {
      const res = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), color }),
      })
      if (res.ok) {
        onCreated()
      } else {
        const data = (await res.json()) as { error?: string }
        setError(data.error ?? 'Failed to create tag')
      }
    } catch {
      setError('Failed to create tag')
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-2 p-3 border border-[var(--border)] rounded-md bg-[var(--paper)] mt-2"
    >
      <div className="flex flex-col gap-1">
        <label htmlFor="tag-name" className="text-xs font-medium text-[var(--foreground)]">
          Name
        </label>
        <input
          id="tag-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Tag name"
          className="px-2 py-1 text-sm border border-[var(--border)] rounded bg-[var(--background)] text-[var(--foreground)]"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="tag-color" className="text-xs font-medium text-[var(--foreground)]">
          Color
        </label>
        <select
          id="tag-color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="px-2 py-1 text-sm border border-[var(--border)] rounded bg-[var(--background)] text-[var(--foreground)]"
        >
          {TAG_COLORS.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
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

// ─── Tag popover (per-doc tag assignment) ─────────────────────────────────────

interface TagPopoverProps {
  docId: string
  docTitle: string
  allTags: TagDTO[]
  onClose: () => void
  /** Called after a tag is added/removed so the parent can refresh sidebar
   *  counts and the current view. */
  onChanged?: () => void
}

function TagPopover({ docId, docTitle, allTags, onClose, onChanged }: TagPopoverProps) {
  const [docTags, setDocTags] = useState<DocTagDTO[]>([])
  const [loading, setLoading] = useState(true)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/docs/${docId}/tags`)
      .then((r) => r.json() as Promise<DocTagDTO[]>)
      .then((data) => {
        if (!cancelled) {
          setDocTags(data)
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [docId])

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const isAssigned = (tagId: string) => docTags.some((t) => t.id === tagId)

  const toggle = async (tagId: string) => {
    if (isAssigned(tagId)) {
      try {
        await fetch(`/api/docs/${docId}/tags?tagId=${encodeURIComponent(tagId)}`, {
          method: 'DELETE',
        })
        setDocTags((prev) => prev.filter((t) => t.id !== tagId))
        onChanged?.()
      } catch {
        // leave state unchanged
      }
    } else {
      try {
        const res = await fetch(`/api/docs/${docId}/tags`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ tagId }),
        })
        if (res.ok) {
          const tag = allTags.find((t) => t.id === tagId)
          if (tag) setDocTags((prev) => [...prev, { id: tag.id, name: tag.name, color: tag.color }])
          onChanged?.()
        }
      } catch {
        // leave state unchanged
      }
    }
  }

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`Edit tags for ${docTitle}`}
      className="absolute z-50 right-0 top-8 w-52 bg-[var(--paper)] border border-[var(--border)] rounded-md shadow-lg p-3 flex flex-col gap-2"
    >
      <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">Tags</p>
      {loading ? (
        <p className="text-xs text-[var(--muted)]">Loading…</p>
      ) : allTags.length === 0 ? (
        <p className="text-xs text-[var(--muted)]">No tags yet.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {allTags.map((tag) => {
            const assigned = isAssigned(tag.id)
            return (
              <li key={tag.id} className="flex items-center gap-2">
                <input
                  id={`tag-cb-${docId}-${tag.id}`}
                  type="checkbox"
                  checked={assigned}
                  onChange={() => toggle(tag.id)}
                  className="rounded"
                />
                <label
                  htmlFor={`tag-cb-${docId}-${tag.id}`}
                  className="flex items-center gap-1.5 text-sm cursor-pointer"
                >
                  <span
                    aria-hidden="true"
                    className="inline-block w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: resolveTagColor(tag.color).bg }}
                  />
                  {tag.name}
                </label>
              </li>
            )
          })}
        </ul>
      )}
      <button
        type="button"
        onClick={onClose}
        className="text-xs text-[var(--muted)] hover:text-[var(--foreground)] text-right mt-1"
      >
        Close
      </button>
    </div>
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

// ─── Sort + View toolbar ──────────────────────────────────────────────────────

interface SortViewToolbarProps {
  sortKey: SortKey
  sortDir: SortDir
  viewMode: ViewMode
  onSortKey: (key: SortKey) => void
  onSortDir: (dir: SortDir) => void
  onViewMode: (mode: ViewMode) => void
}

function SortViewToolbar({
  sortKey,
  sortDir,
  viewMode,
  onSortKey,
  onSortDir,
  onViewMode,
}: SortViewToolbarProps) {
  return (
    <div className="flex items-center gap-3 mb-3 flex-wrap">
      {/* Sort controls */}
      <div className="flex items-center gap-1">
        <label htmlFor="fm-sort-key" className="text-xs text-[var(--muted)] shrink-0">
          Sort by
        </label>
        <select
          id="fm-sort-key"
          value={sortKey}
          onChange={(e) => onSortKey(e.target.value as SortKey)}
          className="px-2 py-1 text-xs border border-[var(--border)] rounded bg-[var(--background)] text-[var(--foreground)]"
        >
          {SORT_KEYS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => onSortDir(sortDir === 'asc' ? 'desc' : 'asc')}
          aria-label={sortDir === 'asc' ? 'Sort descending' : 'Sort ascending'}
          className="px-2 py-1 text-xs border border-[var(--border)] rounded bg-[var(--background)] text-[var(--foreground)] hover:text-[var(--accent-contrast)]"
        >
          {sortDir === 'asc' ? '↑ Asc' : '↓ Desc'}
        </button>
      </div>

      {/* View mode toggle */}
      <div className="flex items-center gap-0.5 border border-[var(--border)] rounded overflow-hidden ml-auto">
        {(['list', 'grid', 'details'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => onViewMode(mode)}
            aria-pressed={viewMode === mode}
            className={[
              'px-2 py-1 text-xs capitalize',
              viewMode === mode
                ? 'bg-[var(--accent-contrast)] text-white'
                : 'bg-[var(--background)] text-[var(--muted)] hover:text-[var(--foreground)]',
            ].join(' ')}
          >
            {mode === 'list' ? '☰ List' : mode === 'grid' ? '⊞ Grid' : '≡ Details'}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Doc rendering helpers ────────────────────────────────────────────────────

interface DocActionsProps {
  doc: DocDTO
  view: 'recents' | 'starred' | 'trash' | 'tag' | 'all'
  onRefresh: () => void
  allTags: TagDTO[]
  onTagsChanged?: (() => void) | undefined
}

function DocActions({ doc, view, onRefresh, allTags, onTagsChanged }: DocActionsProps) {
  const [showTagPopover, setShowTagPopover] = useState(false)

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
    <div className="flex items-center gap-1 shrink-0">
      {/* Tag button + popover */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setShowTagPopover((v) => !v)}
          aria-label={`Edit tags for ${doc.title}`}
          className="text-sm px-1 text-[var(--muted)] hover:text-[var(--accent-contrast)]"
        >
          🏷
        </button>
        {showTagPopover && (
          <TagPopover
            docId={doc.id}
            docTitle={doc.title}
            allTags={allTags}
            onClose={() => setShowTagPopover(false)}
            onChanged={() => {
              onRefresh()
              onTagsChanged?.()
            }}
          />
        )}
      </div>
      {view !== 'trash' && (
        <>
          <button
            type="button"
            onClick={handleStar}
            aria-label={isStarred ? `Unstar ${doc.title}` : `Star ${doc.title}`}
            className="text-base leading-none px-1 hover:text-[var(--accent-contrast)]"
          >
            {isStarred ? '★' : '☆'}
          </button>
          <button
            type="button"
            onClick={handleTrash}
            aria-label={`Move ${doc.title} to trash`}
            className="text-xs px-2 py-1 rounded border border-[var(--border)] text-[var(--muted)] hover:text-red-600 hover:border-red-400"
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
          className="text-xs px-2 py-1 rounded border border-[var(--border)] text-[var(--muted)] hover:text-[var(--accent-contrast)] hover:border-[var(--accent-contrast)]"
        >
          Restore
        </button>
      )}
    </div>
  )
}

// ─── Bulk action bar ──────────────────────────────────────────────────────────

interface BulkActionBarProps {
  selected: Set<string>
  folders: FolderDTO[]
  allTags: TagDTO[]
  onClear: () => void
  onRefresh: () => void
  onTagsChanged?: () => void
}

function BulkActionBar({
  selected,
  folders,
  allTags,
  onClear,
  onRefresh,
  onTagsChanged,
}: BulkActionBarProps) {
  const count = selected.size
  if (count === 0) return null

  const bulkPost = async (body: Record<string, unknown>) => {
    try {
      const res = await fetch('/api/docs/bulk', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ids: [...selected], ...body }),
      })
      return res.ok
    } catch {
      return false
    }
  }

  const handleMove = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value
    if (!val) return
    const folderId = val === '__root__' ? null : val
    const ok = await bulkPost({ action: 'move', folderId })
    if (ok) {
      onClear()
      onRefresh()
    }
    // reset the select
    e.target.value = ''
  }

  const handleTag = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const tagId = e.target.value
    if (!tagId) return
    const ok = await bulkPost({ action: 'tag', tagId })
    if (ok) {
      onClear()
      onRefresh()
      onTagsChanged?.()
    }
    e.target.value = ''
  }

  const handleTrash = async () => {
    const ok = await bulkPost({ action: 'trash' })
    if (ok) {
      onClear()
      onRefresh()
    }
  }

  return (
    <section
      aria-label="Bulk actions"
      className="flex items-center gap-3 px-3 py-2 mb-3 rounded-md border border-[var(--accent-contrast)] bg-[var(--paper)] flex-wrap"
    >
      <span className="text-sm font-medium text-[var(--foreground)] shrink-0">
        {count} selected
      </span>

      {/* Move to… */}
      <label htmlFor="bulk-move-select" className="sr-only">
        Move selected documents to folder
      </label>
      <select
        id="bulk-move-select"
        defaultValue=""
        onChange={handleMove}
        className="px-2 py-1 text-xs border border-[var(--border)] rounded bg-[var(--background)] text-[var(--foreground)]"
      >
        <option value="" disabled>
          Move to…
        </option>
        <option value="__root__">Root</option>
        {folders.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>

      {/* Add tag… */}
      {allTags.length > 0 && (
        <>
          <label htmlFor="bulk-tag-select" className="sr-only">
            Add tag to selected documents
          </label>
          <select
            id="bulk-tag-select"
            defaultValue=""
            onChange={handleTag}
            className="px-2 py-1 text-xs border border-[var(--border)] rounded bg-[var(--background)] text-[var(--foreground)]"
          >
            <option value="" disabled>
              Add tag…
            </option>
            {allTags.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </>
      )}

      {/* Delete */}
      <button
        type="button"
        onClick={handleTrash}
        className="px-2 py-1 text-xs rounded border border-[var(--border)] text-[var(--muted)] hover:text-red-600 hover:border-red-400"
      >
        🗑 Delete
      </button>

      {/* Clear */}
      <button
        type="button"
        onClick={onClear}
        className="px-2 py-1 text-xs rounded border border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)] ml-auto"
      >
        Clear
      </button>
    </section>
  )
}

// ─── Shared doc renderer (list / grid / details) ──────────────────────────────

interface DocListProps {
  docs: DocDTO[]
  viewMode: ViewMode
  sortKey: SortKey
  sortDir: SortDir
  onSortKey: (key: SortKey) => void
  onSortDir: (dir: SortDir) => void
  view: 'recents' | 'starred' | 'trash' | 'tag' | 'all'
  onRefresh: () => void
  allTags: TagDTO[]
  onTagsChanged?: () => void
  /** Selection state — passed from parent */
  selected: Set<string>
  anchorId: string | null
  onToggle: (docId: string, shiftKey: boolean, orderedIds: string[]) => void
  onSelectAll: (allIds: string[]) => void
}

function DocList({
  docs,
  viewMode,
  sortKey,
  sortDir,
  onSortKey,
  onSortDir,
  view,
  onRefresh,
  allTags,
  onTagsChanged,
  selected,
  // anchorId is managed by the parent; we only use selected + orderedIds here
  onToggle,
  onSelectAll,
}: DocListProps) {
  const fmt = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' })

  const handleHeaderClick = (key: SortKey) => {
    if (sortKey === key) {
      onSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      onSortKey(key)
    }
  }

  const thAriaSort = (key: SortKey): 'ascending' | 'descending' | 'none' => {
    if (sortKey !== key) return 'none'
    return sortDir === 'asc' ? 'ascending' : 'descending'
  }

  const orderedIds = docs.map((d) => d.id)
  const allDisplayedSelected = docs.length > 0 && docs.every((d) => selected.has(d.id))

  if (viewMode === 'list') {
    return (
      <>
        {/* Select-all row */}
        <div className="flex items-center gap-2 py-1 border-b border-[var(--border)] mb-1">
          <input
            type="checkbox"
            checked={allDisplayedSelected}
            aria-label="Select all documents"
            onChange={() => onSelectAll(orderedIds)}
            className="rounded"
          />
          <span className="text-xs text-[var(--muted)]">Select all</span>
        </div>
        <ul className="divide-y divide-[var(--border)]">
          {docs.map((doc) => (
            <li key={doc.id}>
              <div className="flex items-center justify-between py-2 gap-2">
                <input
                  type="checkbox"
                  checked={selected.has(doc.id)}
                  aria-label={`Select ${doc.title}`}
                  onClick={(e) => onToggle(doc.id, e.shiftKey, orderedIds)}
                  onChange={() => {
                    // handled by onClick to capture shiftKey
                  }}
                  className="rounded shrink-0"
                />
                <a
                  href={`/d/${doc.id}`}
                  className="flex-1 font-medium hover:text-[var(--accent-contrast)] truncate"
                >
                  📄 {doc.title}
                </a>
                <time dateTime={doc.updatedAt} className="text-[var(--muted)] text-xs shrink-0">
                  {fmt.format(new Date(doc.updatedAt))}
                </time>
                <DocActions
                  doc={doc}
                  view={view}
                  onRefresh={onRefresh}
                  allTags={allTags}
                  onTagsChanged={onTagsChanged}
                />
              </div>
            </li>
          ))}
        </ul>
      </>
    )
  }

  if (viewMode === 'grid') {
    return (
      <>
        {/* Select-all row */}
        <div className="flex items-center gap-2 py-1 mb-2">
          <input
            type="checkbox"
            checked={allDisplayedSelected}
            aria-label="Select all documents"
            onChange={() => onSelectAll(orderedIds)}
            className="rounded"
          />
          <span className="text-xs text-[var(--muted)]">Select all</span>
        </div>
        <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {docs.map((doc) => (
            <li key={doc.id} className="relative">
              {/* Checkbox overlay */}
              <div className="absolute top-2 left-2 z-10">
                <input
                  type="checkbox"
                  checked={selected.has(doc.id)}
                  aria-label={`Select ${doc.title}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggle(doc.id, e.shiftKey, orderedIds)
                  }}
                  onChange={() => {
                    // handled by onClick to capture shiftKey
                  }}
                  className="rounded"
                />
              </div>
              <a
                href={`/d/${doc.id}`}
                aria-label={doc.title}
                className={[
                  'flex flex-col gap-1 p-3 pl-8 border border-[var(--border)] rounded-lg bg-[var(--paper)] hover:border-[var(--accent-contrast)] transition-colors h-full',
                  selected.has(doc.id) ? 'border-[var(--accent-contrast)]' : '',
                ].join(' ')}
              >
                <span className="text-2xl" aria-hidden="true">
                  📄
                </span>
                <span className="font-medium text-sm truncate text-[var(--foreground)]">
                  {doc.title}
                </span>
                {doc.preview.length > 0 && (
                  <span
                    className="text-xs text-[var(--muted)] line-clamp-3 break-words"
                    aria-hidden="true"
                  >
                    {doc.preview}
                  </span>
                )}
              </a>
            </li>
          ))}
        </ul>
      </>
    )
  }

  // details
  return (
    <table className="w-full text-sm border-collapse">
      <thead>
        <tr className="border-b border-[var(--border)] text-[var(--muted)] text-xs">
          <th scope="col" className="text-left py-2 pr-2 w-6">
            <input
              type="checkbox"
              checked={allDisplayedSelected}
              aria-label="Select all documents"
              onChange={() => onSelectAll(orderedIds)}
              className="rounded"
            />
          </th>
          <th
            scope="col"
            aria-sort={thAriaSort('name')}
            className="text-left py-2 pr-3 font-medium"
          >
            <button
              type="button"
              onClick={() => handleHeaderClick('name')}
              className="hover:text-[var(--foreground)]"
            >
              Name {sortKey === 'name' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
            </button>
          </th>
          <th
            scope="col"
            aria-sort={thAriaSort('modified')}
            className="text-left py-2 pr-3 font-medium"
          >
            <button
              type="button"
              onClick={() => handleHeaderClick('modified')}
              className="hover:text-[var(--foreground)]"
            >
              Modified {sortKey === 'modified' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
            </button>
          </th>
          <th
            scope="col"
            aria-sort={thAriaSort('created')}
            className="text-left py-2 pr-3 font-medium"
          >
            <button
              type="button"
              onClick={() => handleHeaderClick('created')}
              className="hover:text-[var(--foreground)]"
            >
              Created {sortKey === 'created' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
            </button>
          </th>
          <th
            scope="col"
            aria-sort={thAriaSort('size')}
            className="text-left py-2 pr-3 font-medium"
          >
            <button
              type="button"
              onClick={() => handleHeaderClick('size')}
              className="hover:text-[var(--foreground)]"
            >
              Size {sortKey === 'size' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
            </button>
          </th>
          <th scope="col" className="text-left py-2 font-medium">
            Actions
          </th>
        </tr>
      </thead>
      <tbody>
        {docs.map((doc) => (
          <tr key={doc.id} className="border-b border-[var(--border)] hover:bg-[var(--paper)]">
            <td className="py-2 pr-2">
              <input
                type="checkbox"
                checked={selected.has(doc.id)}
                aria-label={`Select ${doc.title}`}
                onClick={(e) => onToggle(doc.id, e.shiftKey, orderedIds)}
                onChange={() => {
                  // handled by onClick to capture shiftKey
                }}
                className="rounded"
              />
            </td>
            <td className="py-2 pr-3">
              <a
                href={`/d/${doc.id}`}
                className="font-medium hover:text-[var(--accent-contrast)] truncate block max-w-xs"
              >
                📄 {doc.title}
              </a>
            </td>
            <td className="py-2 pr-3 text-[var(--muted)] text-xs whitespace-nowrap">
              <time dateTime={doc.updatedAt}>{fmt.format(new Date(doc.updatedAt))}</time>
            </td>
            <td className="py-2 pr-3 text-[var(--muted)] text-xs whitespace-nowrap">
              <time dateTime={doc.createdAt}>{fmt.format(new Date(doc.createdAt))}</time>
            </td>
            <td className="py-2 pr-3 text-[var(--muted)] text-xs" aria-label={`${doc.size} chars`}>
              {formatSize(doc.size)}
            </td>
            <td className="py-2">
              <DocActions
                doc={doc}
                view={view}
                onRefresh={onRefresh}
                allTags={allTags}
                onTagsChanged={onTagsChanged}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ─── All-view doc row (drag + tag button + checkbox) ─────────────────────────

interface AllViewDocRowProps {
  doc: DocDTO
  allTags: TagDTO[]
  selected: boolean
  onToggle: (shiftKey: boolean) => void
}

function AllViewDocRow({ doc, allTags, selected, onToggle }: AllViewDocRowProps) {
  const [showTagPopover, setShowTagPopover] = useState(false)

  return (
    <div className="flex items-center justify-between py-2 gap-2">
      <input
        type="checkbox"
        checked={selected}
        aria-label={`Select ${doc.title}`}
        onClick={(e) => onToggle(e.shiftKey)}
        onChange={() => {
          // handled by onClick to capture shiftKey
        }}
        className="rounded shrink-0"
      />
      <a
        href={`/d/${doc.id}`}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('application/json', JSON.stringify({ type: 'doc', id: doc.id }))
          e.dataTransfer.effectAllowed = 'move'
        }}
        className="flex-1 font-medium hover:text-[var(--accent-contrast)]"
      >
        📄 {doc.title}
      </a>
      <time dateTime={doc.updatedAt} className="text-[var(--muted)] text-xs shrink-0 ml-4">
        {new Intl.DateTimeFormat('en', {
          dateStyle: 'medium',
          timeStyle: 'short',
        }).format(new Date(doc.updatedAt))}
      </time>
      <div className="relative shrink-0">
        <button
          type="button"
          onClick={() => setShowTagPopover((v) => !v)}
          aria-label={`Edit tags for ${doc.title}`}
          className="text-sm px-1 text-[var(--muted)] hover:text-[var(--accent-contrast)]"
        >
          🏷
        </button>
        {showTagPopover && (
          <TagPopover
            docId={doc.id}
            docTitle={doc.title}
            allTags={allTags}
            onClose={() => setShowTagPopover(false)}
          />
        )}
      </div>
    </div>
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
  const [tags, setTags] = useState<TagDTO[]>([])
  const [activeTagId, setActiveTagId] = useState<string | null>(null)
  const [tagDocs, setTagDocs] = useState<DocDTO[]>([])
  const [showTagCreateForm, setShowTagCreateForm] = useState(false)

  // ─── Selection state ──────────────────────────────────────────────────────────
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [anchorId, setAnchorId] = useState<string | null>(null)

  const clearSelection = useCallback(() => {
    setSelected(new Set())
    setAnchorId(null)
  }, [])

  const handleToggle = useCallback(
    (docId: string, shiftKey: boolean, orderedIds: string[]) => {
      if (shiftKey && anchorId !== null) {
        const range = rangeBetween(orderedIds, anchorId, docId)
        setSelected((prev) => {
          const next = new Set(prev)
          for (const id of range) next.add(id)
          return next
        })
      } else {
        setSelected((prev) => toggleSelection(prev, docId))
        setAnchorId(docId)
      }
    },
    [anchorId],
  )

  const handleSelectAll = useCallback(
    (allIds: string[]) => {
      const allSelected = allIds.every((id) => selected.has(id))
      if (allSelected) {
        setSelected(new Set())
        setAnchorId(null)
      } else {
        setSelected(new Set(allIds))
      }
    },
    [selected],
  )

  // Sort + view-mode state (hydrated from localStorage on mount)
  const [sortKey, setSortKeyState] = useState<SortKey>('modified')
  const [sortDir, setSortDirState] = useState<SortDir>('desc')
  const [viewMode, setViewModeState] = useState<ViewMode>('list')

  // Hydrate from localStorage on mount
  useEffect(() => {
    const sk = lsGet(LS_SORT_KEY)
    const sd = lsGet(LS_SORT_DIR)
    const vm = lsGet(LS_VIEW_MODE)
    if (sk === 'name' || sk === 'modified' || sk === 'created' || sk === 'size') setSortKeyState(sk)
    if (sd === 'asc' || sd === 'desc') setSortDirState(sd)
    if (vm === 'list' || vm === 'grid' || vm === 'details') setViewModeState(vm)
  }, [])

  const setSortKey = (key: SortKey) => {
    setSortKeyState(key)
    lsSet(LS_SORT_KEY, key)
  }

  const setSortDir = (dir: SortDir) => {
    setSortDirState(dir)
    lsSet(LS_SORT_DIR, dir)
  }

  const setViewMode = (mode: ViewMode) => {
    setViewModeState(mode)
    lsSet(LS_VIEW_MODE, mode)
  }

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

  // Fetch tags
  const fetchTags = useCallback(async () => {
    try {
      const res = await fetch('/api/tags')
      if (res.ok) {
        const data = (await res.json()) as TagDTO[]
        setTags(data)
      }
    } catch {
      // leave state unchanged
    }
  }, [])

  // Fetch docs for active tag
  const fetchTagResults = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/tags/${id}/results`)
      if (res.ok) {
        const data = (await res.json()) as DocDTO[]
        setTagDocs(data)
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
      clearSelection()
    },
    [fetchDocs, clearSelection],
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

  // Fetch tags on mount
  useEffect(() => {
    fetchTags()
  }, [fetchTags])

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

  // Sorted doc lists
  const sortedDocs = sortDocs(docs, sortKey, sortDir)
  const sortedFlatDocs = sortDocs(flatDocs, sortKey, sortDir)
  const sortedSmartDocs = sortDocs(smartDocs, sortKey, sortDir)
  const sortedTagDocs = sortDocs(tagDocs, sortKey, sortDir)

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
              setActiveTagId(null)
              clearSelection()
            }}
            aria-current={view === key && view !== 'smart' && view !== 'tag' ? 'page' : undefined}
            className={[
              'px-3 py-1.5 text-sm rounded-t font-medium',
              view === key && view !== 'smart' && view !== 'tag'
                ? 'text-[var(--accent-contrast)] border-b-2 border-[var(--accent-contrast)]'
                : 'text-[var(--muted)] hover:text-[var(--foreground)]',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </nav>

      {/* View content */}
      {(view === 'all' || view === 'smart' || view === 'tag') && (
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
                        clearSelection()
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

            {/* Tags section */}
            <div className="mt-4 flex flex-col gap-1">
              <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide px-1">
                Tags
              </p>
              <ul className="flex flex-col gap-0.5">
                {tags.map((tag) => {
                  const tc = resolveTagColor(tag.color)
                  return (
                    <li key={tag.id} className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setView('tag')
                          setActiveTagId(tag.id)
                          setActiveSmartId(null)
                          fetchTagResults(tag.id)
                          clearSelection()
                        }}
                        className={[
                          'flex-1 text-left px-2 py-1 text-sm rounded truncate flex items-center gap-1.5',
                          view === 'tag' && activeTagId === tag.id
                            ? 'font-semibold text-[var(--accent-contrast)]'
                            : 'text-[var(--foreground)] hover:text-[var(--accent-contrast)]',
                        ].join(' ')}
                      >
                        <span
                          aria-hidden="true"
                          className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: tc.bg }}
                        />
                        <span className="truncate">{tag.name}</span>
                        <span className="text-[var(--muted)] text-xs ml-auto shrink-0">
                          {tag.count}
                        </span>
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete tag ${tag.name}`}
                        onClick={async () => {
                          try {
                            const res = await fetch(`/api/tags/${tag.id}`, { method: 'DELETE' })
                            if (res.ok) {
                              if (activeTagId === tag.id) {
                                setView('all')
                                setActiveTagId(null)
                              }
                              await fetchTags()
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
                  )
                })}
              </ul>
              <button
                type="button"
                onClick={() => setShowTagCreateForm((v) => !v)}
                className="text-xs text-[var(--muted)] hover:text-[var(--accent-contrast)] text-left px-2 py-1"
              >
                + New tag
              </button>
              {showTagCreateForm && (
                <TagCreateForm
                  onCreated={async () => {
                    await fetchTags()
                    setShowTagCreateForm(false)
                  }}
                  onCancel={() => setShowTagCreateForm(false)}
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
                  <>
                    {/* Sort/view toolbar — only shown when there are docs */}
                    {docs.length > 0 && (
                      <SortViewToolbar
                        sortKey={sortKey}
                        sortDir={sortDir}
                        viewMode={viewMode}
                        onSortKey={setSortKey}
                        onSortDir={setSortDir}
                        onViewMode={setViewMode}
                      />
                    )}
                    {/* Bulk action bar */}
                    {docs.length > 0 && (
                      <BulkActionBar
                        selected={selected}
                        folders={folders}
                        allTags={tags}
                        onClear={clearSelection}
                        onRefresh={() => fetchDocs(currentFolderId)}
                        onTagsChanged={fetchTags}
                      />
                    )}
                    <ul className="divide-y divide-[var(--border)]">
                      {/* Subfolder rows — always list, not affected by viewMode */}
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
                    </ul>

                    {/* Document list — sorted + view mode aware */}
                    {docs.length > 0 &&
                      (viewMode === 'list' ? (
                        <>
                          {/* Select-all for all-view list */}
                          <div className="flex items-center gap-2 py-1 border-b border-[var(--border)] mb-1">
                            <input
                              type="checkbox"
                              checked={
                                sortedDocs.length > 0 && sortedDocs.every((d) => selected.has(d.id))
                              }
                              aria-label="Select all documents"
                              onChange={() => handleSelectAll(sortedDocs.map((d) => d.id))}
                              className="rounded"
                            />
                            <span className="text-xs text-[var(--muted)]">Select all</span>
                          </div>
                          <ul className="divide-y divide-[var(--border)]">
                            {sortedDocs.map((doc) => (
                              <li key={doc.id}>
                                <AllViewDocRow
                                  doc={doc}
                                  allTags={tags}
                                  selected={selected.has(doc.id)}
                                  onToggle={(shiftKey) =>
                                    handleToggle(
                                      doc.id,
                                      shiftKey,
                                      sortedDocs.map((d) => d.id),
                                    )
                                  }
                                />
                              </li>
                            ))}
                          </ul>
                        </>
                      ) : (
                        <div className="mt-2">
                          <DocList
                            docs={sortedDocs}
                            viewMode={viewMode}
                            sortKey={sortKey}
                            sortDir={sortDir}
                            onSortKey={setSortKey}
                            onSortDir={setSortDir}
                            view="all"
                            onRefresh={() => fetchDocs(currentFolderId)}
                            allTags={tags}
                            selected={selected}
                            anchorId={anchorId}
                            onToggle={handleToggle}
                            onSelectAll={handleSelectAll}
                          />
                        </div>
                      ))}
                  </>
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
                      <>
                        <SortViewToolbar
                          sortKey={sortKey}
                          sortDir={sortDir}
                          viewMode={viewMode}
                          onSortKey={setSortKey}
                          onSortDir={setSortDir}
                          onViewMode={setViewMode}
                        />
                        <BulkActionBar
                          selected={selected}
                          folders={folders}
                          allTags={tags}
                          onClear={clearSelection}
                          onRefresh={() => {
                            if (activeSmartId !== null) fetchSmartResults(activeSmartId)
                          }}
                          onTagsChanged={fetchTags}
                        />
                        <DocList
                          docs={sortedSmartDocs}
                          viewMode={viewMode}
                          sortKey={sortKey}
                          sortDir={sortDir}
                          onSortKey={setSortKey}
                          onSortDir={setSortDir}
                          view="recents"
                          onRefresh={() => {
                            if (activeSmartId !== null) fetchSmartResults(activeSmartId)
                          }}
                          allTags={tags}
                          onTagsChanged={fetchTags}
                          selected={selected}
                          anchorId={anchorId}
                          onToggle={handleToggle}
                          onSelectAll={handleSelectAll}
                        />
                      </>
                    )}
                  </>
                )
              })()}

            {view === 'tag' &&
              activeTagId !== null &&
              (() => {
                const activeTag = tags.find((t) => t.id === activeTagId)
                const tc = resolveTagColor(activeTag?.color ?? 'slate')
                return (
                  <>
                    <div className="mb-4 flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="inline-block w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: tc.bg }}
                      />
                      <h2 className="text-base font-semibold text-[var(--foreground)]">
                        Tag: {activeTag?.name ?? ''}
                      </h2>
                    </div>
                    {tagDocs.length === 0 ? (
                      <p className="text-[var(--muted)]">
                        No documents tagged {activeTag?.name ?? ''}.
                      </p>
                    ) : (
                      <>
                        <SortViewToolbar
                          sortKey={sortKey}
                          sortDir={sortDir}
                          viewMode={viewMode}
                          onSortKey={setSortKey}
                          onSortDir={setSortDir}
                          onViewMode={setViewMode}
                        />
                        <BulkActionBar
                          selected={selected}
                          folders={folders}
                          allTags={tags}
                          onClear={clearSelection}
                          onRefresh={() => {
                            if (activeTagId !== null) fetchTagResults(activeTagId)
                          }}
                          onTagsChanged={fetchTags}
                        />
                        <DocList
                          docs={sortedTagDocs}
                          viewMode={viewMode}
                          sortKey={sortKey}
                          sortDir={sortDir}
                          onSortKey={setSortKey}
                          onSortDir={setSortDir}
                          view="tag"
                          onRefresh={() => {
                            if (activeTagId !== null) fetchTagResults(activeTagId)
                          }}
                          allTags={tags}
                          onTagsChanged={fetchTags}
                          selected={selected}
                          anchorId={anchorId}
                          onToggle={handleToggle}
                          onSelectAll={handleSelectAll}
                        />
                      </>
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
            <>
              <SortViewToolbar
                sortKey={sortKey}
                sortDir={sortDir}
                viewMode={viewMode}
                onSortKey={setSortKey}
                onSortDir={setSortDir}
                onViewMode={setViewMode}
              />
              <BulkActionBar
                selected={selected}
                folders={folders}
                allTags={tags}
                onClear={clearSelection}
                onRefresh={handleFlatRefresh}
                onTagsChanged={fetchTags}
              />
              <DocList
                docs={sortedFlatDocs}
                viewMode={viewMode}
                sortKey={sortKey}
                sortDir={sortDir}
                onSortKey={setSortKey}
                onSortDir={setSortDir}
                view={view}
                onRefresh={handleFlatRefresh}
                allTags={tags}
                onTagsChanged={fetchTags}
                selected={selected}
                anchorId={anchorId}
                onToggle={handleToggle}
                onSelectAll={handleSelectAll}
              />
            </>
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
