'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { DocGlyph } from '@/components/file-manager/DocGlyph'
import { FolderGlyph } from '@/components/file-manager/FolderGlyph'
import { Dropdown } from '@/components/ui/Dropdown'
import { Tooltip } from '@/components/ui/Tooltip'
import { docMenuItems } from '@/lib/docs/context-actions'
import type { SortDir, SortKey } from '@/lib/docs/doc-sort'
import { sortDocs } from '@/lib/docs/doc-sort'
import type { FolderNode, TreeNode } from '@/lib/docs/folder-tree'
import { buildTree, folderPath } from '@/lib/docs/folder-tree'
import { rangeBetween, selectOnly, toggle as toggleSelection } from '@/lib/docs/selection'
import { describeCriteria, parseCriteria } from '@/lib/docs/smart-folder-criteria'
import { resolveTagColor, TAG_COLORS } from '@/lib/docs/tag-colors'
import { normalizeFilesView } from '@/lib/shell/nav'

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

// S2-4: the `VIEWS` strip array is gone — the view tab bar it backed was removed
// (the views now live in the global sidebar nav). The `View` type below still
// drives the in-component `view` state, reached via `?view=` + sidebar routing.

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
          className="px-3 py-1 text-xs rounded bg-[var(--primary)] text-[var(--on-primary)] font-medium"
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
          className="px-3 py-1 text-xs rounded bg-[var(--primary)] text-[var(--on-primary)] font-medium"
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
    // S5-3: the tag picker adopts the shared dropdown elevation — 8px radius,
    // --shadow-dropdown, white --surface, --border-chrome (no bespoke shadow-lg
    // / --paper). Tokens match the `.px-menu` shell every other overlay uses.
    <div
      ref={ref}
      role="dialog"
      aria-label={`Edit tags for ${docTitle}`}
      className="px-overlay-enter absolute z-50 right-0 top-8 w-52 rounded-lg border border-[var(--border-chrome)] bg-[var(--surface)] p-3 flex flex-col gap-2 shadow-[var(--shadow-dropdown)]"
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
              'flex w-full items-center gap-2 text-left px-2 py-1 text-sm rounded truncate transition-colors duration-150',
              over
                ? 'bg-[var(--primary)] text-[var(--on-primary)]'
                : isActive
                  ? 'font-semibold text-[var(--primary)]'
                  : 'text-[var(--foreground)] hover:text-[var(--primary)]',
            ].join(' ')}
          >
            <FolderGlyph />
            <span className="truncate">{node.name}</span>
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
  // S5-4: the sort chip reads the current key + direction (e.g. "Name ↑");
  // clicking it cycles the direction. The <select> stays for picking the key
  // (a11y: a labelled control), styled as a flat chip. No behavior change —
  // doc-sort.ts already produces the order.
  const sortLabel = SORT_KEYS.find((s) => s.key === sortKey)?.label ?? 'Sort'
  const VIEW_MODES = [
    { mode: 'list' as const, icon: 'view_list', label: 'List view' },
    { mode: 'grid' as const, icon: 'grid_view', label: 'Grid view' },
    { mode: 'details' as const, icon: 'view_column', label: 'Details view' },
  ]

  return (
    <div className="flex items-center gap-2 mb-3 flex-wrap">
      {/* Sort chip — key select + a direction toggle, right-aligned group with
          the view toggle pushed to the trailing edge. */}
      <div className="flex items-center gap-1 ml-auto">
        <label htmlFor="fm-sort-key" className="sr-only">
          Sort by
        </label>
        <select
          id="fm-sort-key"
          value={sortKey}
          onChange={(e) => onSortKey(e.target.value as SortKey)}
          aria-label="Sort by"
          className="h-8 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--foreground)]"
        >
          {SORT_KEYS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
        <Tooltip label={sortDir === 'asc' ? 'Sort descending' : 'Sort ascending'}>
          <button
            type="button"
            onClick={() => onSortDir(sortDir === 'asc' ? 'desc' : 'asc')}
            aria-label={`${sortLabel}, ${sortDir === 'asc' ? 'ascending — sort descending' : 'descending — sort ascending'}`}
            className="px-interactive flex h-8 w-8 items-center justify-center text-[var(--muted)]"
          >
            <span aria-hidden className="material-symbols-rounded text-[20px]">
              {sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward'}
            </span>
          </button>
        </Tooltip>
      </div>

      {/* Segmented icon-only View toggle (List / Grid / Details). */}
      {/* biome-ignore lint/a11y/useSemanticElements: a toolbar-style toggle group; <fieldset> would impose legend/box semantics inappropriate for an icon segmented control */}
      <div
        className="flex items-center rounded-full border border-[var(--border)] overflow-hidden"
        role="group"
        aria-label="View mode"
      >
        {VIEW_MODES.map(({ mode, icon, label }) => (
          <Tooltip key={mode} label={label}>
            <button
              type="button"
              onClick={() => onViewMode(mode)}
              aria-pressed={viewMode === mode}
              aria-label={label}
              className={[
                'flex h-8 w-9 items-center justify-center',
                viewMode === mode
                  ? 'bg-[var(--primary-surface)] text-[var(--primary-surface-text)]'
                  : 'text-[var(--muted)] hover:bg-[var(--surface-hover)]',
              ].join(' ')}
            >
              <span aria-hidden className="material-symbols-rounded text-[20px]">
                {icon}
              </span>
            </button>
          </Tooltip>
        ))}
      </div>
    </div>
  )
}

// ─── Context menu ─────────────────────────────────────────────────────────────

interface ContextMenuState {
  doc: DocDTO
  x: number
  y: number
}

interface ContextMenuProps {
  state: ContextMenuState
  onClose: () => void
  onRefresh: () => void
  /** Switch to All view and navigate to the doc's folder. */
  navigateTo: (folderId: string | null) => void
  onSetView: (v: 'all') => void
}

function ContextMenu({ state, onClose, onRefresh, navigateTo, onSetView }: ContextMenuProps) {
  const { doc, x, y } = state
  const ref = useRef<HTMLDivElement>(null)
  const items = docMenuItems({ starred: doc.starred ?? false })

  // Close on outside click or Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  const handleAction = async (key: string) => {
    onClose()
    switch (key) {
      case 'open':
        window.location.href = `/d/${doc.id}`
        break
      case 'rename': {
        const next = window.prompt('Rename', doc.title)
        if (next !== null && next.trim() !== '' && next.trim() !== doc.title) {
          try {
            const res = await fetch(`/api/docs/${doc.id}/rename`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ title: next.trim() }),
            })
            if (res.ok) onRefresh()
          } catch {
            // leave state unchanged
          }
        }
        break
      }
      case 'duplicate': {
        try {
          const res = await fetch(`/api/docs/${doc.id}/duplicate`, { method: 'POST' })
          if (res.ok) onRefresh()
        } catch {
          // leave state unchanged
        }
        break
      }
      case 'star': {
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
        break
      }
      case 'export-md': {
        try {
          const res = await fetch(`/api/docs/${doc.id}`)
          if (res.ok) {
            const data = (await res.json()) as { markdown?: string }
            const md = data.markdown ?? ''
            const blob = new Blob([md], { type: 'text/markdown' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `${doc.title}.md`
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(url)
          }
        } catch {
          // leave state unchanged
        }
        break
      }
      case 'show-in-folder': {
        onSetView('all')
        navigateTo(doc.folderId ?? null)
        break
      }
      case 'template': {
        // G2: capture this doc's current content as a reusable user template.
        const name = window.prompt('Template name', doc.title)
        if (name !== null && name.trim() !== '') {
          try {
            const res = await fetch('/api/templates', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ name: name.trim(), fromDocId: doc.id }),
            })
            if (res.ok) {
              window.alert(`Saved “${name.trim()}” to your templates.`)
            }
          } catch {
            // leave state unchanged
          }
        }
        break
      }
      case 'trash': {
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
        break
      }
      // share is disabled — no handler
      default:
        break
    }
  }

  // Clamp position so the menu doesn't overflow the viewport. S5-3: the menu
  // rides the shared `.px-menu` shell (via ui/Dropdown), positioned `fixed` at
  // the click point (the `--fixed` modifier flips the base `position: absolute`).
  // MENU_W/MENU_H approximate the menu box; we keep an 8px gutter from each edge
  // so a click near the right/bottom edge still renders fully on-screen.
  const MENU_W = 220
  const MENU_H = 320
  const vw = typeof window === 'undefined' ? Number.POSITIVE_INFINITY : window.innerWidth
  const vh = typeof window === 'undefined' ? Number.POSITIVE_INFINITY : window.innerHeight
  const clampedLeft = Math.max(8, Math.min(x, vw - MENU_W))
  const clampedTop = Math.max(8, Math.min(y, vh - MENU_H))
  const menuStyle: React.CSSProperties = {
    top: clampedTop,
    left: clampedLeft,
    zIndex: 1000,
  }

  return (
    <Dropdown
      ref={ref}
      role="menu"
      aria-label={`Actions for ${doc.title}`}
      style={menuStyle}
      className="px-menu--fixed px-overlay-enter"
    >
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          role="menuitem"
          aria-disabled={!item.enabled}
          title={item.note}
          onClick={() => {
            if (item.enabled) handleAction(item.key)
          }}
          className="px-menu-item px-menu-action"
        >
          {item.label}
        </button>
      ))}
    </Dropdown>
  )
}

// ─── Doc rendering helpers ────────────────────────────────────────────────────

interface DocActionsProps {
  doc: DocDTO
  view: 'recents' | 'starred' | 'trash' | 'tag' | 'all'
  onRefresh: () => void
  allTags: TagDTO[]
  onTagsChanged?: (() => void) | undefined
  navigateTo: (folderId: string | null) => void
  onSetView: (v: 'all') => void
}

function DocActions({
  doc,
  view,
  onRefresh,
  allTags,
  onTagsChanged,
  navigateTo,
  onSetView,
}: DocActionsProps) {
  const [showTagPopover, setShowTagPopover] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)

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
    // S5-4 Drive parity: the row action cluster is hidden until the row is
    // hovered (`group-hover/row`) or any control inside it gains keyboard focus
    // (`group-focus-within/row`) — matching Google Drive. The parent row
    // applies `group/row`. focus-within keeps the keyboard path fully reachable
    // (Tab into the row reveals the controls); `transition-opacity` softens it.
    <div className="flex items-center gap-1 shrink-0 opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100">
      {/* Tag button + popover */}
      <div className="relative">
        <Tooltip label={`Edit tags for ${doc.title}`}>
          <button
            type="button"
            onClick={() => setShowTagPopover((v) => !v)}
            aria-label={`Edit tags for ${doc.title}`}
            className="px-interactive flex h-8 w-8 items-center justify-center text-[var(--muted)]"
          >
            <span aria-hidden className="material-symbols-rounded text-[20px]">
              label
            </span>
          </button>
        </Tooltip>
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
          <Tooltip label={isStarred ? `Unstar ${doc.title}` : `Star ${doc.title}`}>
            <button
              type="button"
              onClick={handleStar}
              aria-label={isStarred ? `Unstar ${doc.title}` : `Star ${doc.title}`}
              aria-pressed={isStarred}
              className="px-interactive flex h-8 w-8 items-center justify-center"
              style={{ color: isStarred ? 'var(--star)' : 'var(--muted)' }}
            >
              <span
                aria-hidden
                className="material-symbols-rounded text-[20px]"
                style={{ fontVariationSettings: isStarred ? '"FILL" 1' : '"FILL" 0' }}
              >
                star
              </span>
            </button>
          </Tooltip>
          <Tooltip label={`Move ${doc.title} to trash`}>
            <button
              type="button"
              onClick={handleTrash}
              aria-label={`Move ${doc.title} to trash`}
              className="px-interactive flex h-8 w-8 items-center justify-center text-[var(--muted)]"
            >
              <span aria-hidden className="material-symbols-rounded text-[20px]">
                delete
              </span>
            </button>
          </Tooltip>
        </>
      )}
      {view === 'trash' && (
        <button
          type="button"
          onClick={handleRestore}
          aria-label={`Restore ${doc.title}`}
          className="text-xs px-2 py-1 rounded border border-[var(--border)] text-[var(--muted)] hover:text-[var(--primary)] hover:border-[var(--primary)]"
        >
          Restore
        </button>
      )}
      {/* ⋯ More button — keyboard-accessible path to context menu */}
      <Tooltip label={`Actions for ${doc.title}`}>
        <button
          type="button"
          aria-label={`Actions for ${doc.title}`}
          onClick={(e) => {
            const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect()
            setContextMenu({ x: rect.left, y: rect.bottom + 4 })
          }}
          className="px-interactive flex h-8 w-8 items-center justify-center text-[var(--muted)]"
        >
          <span aria-hidden className="material-symbols-rounded text-[20px]">
            more_horiz
          </span>
        </button>
      </Tooltip>
      {contextMenu !== null && (
        <ContextMenu
          state={{ doc, x: contextMenu.x, y: contextMenu.y }}
          onClose={() => setContextMenu(null)}
          onRefresh={onRefresh}
          navigateTo={navigateTo}
          onSetView={onSetView}
        />
      )}
    </div>
  )
}

// ─── Bulk action bar ──────────────────────────────────────────────────────────

interface BulkActionBarProps {
  selected: Set<string>
  /** Count of currently-visible items, so the bar can show "{n} of {total}". */
  total: number
  folders: FolderDTO[]
  allTags: TagDTO[]
  onClear: () => void
  onRefresh: () => void
  onTagsChanged?: () => void
}

function BulkActionBar({
  selected,
  total,
  folders,
  allTags,
  onClear,
  onRefresh,
  onTagsChanged,
}: BulkActionBarProps) {
  const count = selected.size
  const [exporting, setExporting] = useState(false)

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

  const handleExportZip = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const format = e.target.value
    // reset the select immediately so it looks like a trigger, not a persistent choice
    e.target.value = ''
    if (!format) return
    setExporting(true)
    try {
      const res = await fetch('/api/export/bulk', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ids: [...selected], format }),
      })
      if (res.ok) {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'parchment-export.zip'
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      }
    } catch {
      // leave state unchanged; silently ignore network errors
    } finally {
      setExporting(false)
    }
  }

  return (
    <section
      aria-label="Bulk actions"
      className="flex items-center gap-3 px-3 py-2 mb-3 rounded-md border border-[var(--primary)] bg-[var(--paper)] flex-wrap"
    >
      <span className="text-sm font-medium text-[var(--foreground)] shrink-0">
        {count} of {total} selected
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

      {/* Export as ZIP */}
      <label htmlFor="bulk-export-select" className="sr-only">
        Export selected documents as ZIP
      </label>
      <select
        id="bulk-export-select"
        defaultValue=""
        disabled={exporting}
        onChange={handleExportZip}
        className="px-2 py-1 text-xs border border-[var(--border)] rounded bg-[var(--background)] text-[var(--foreground)] disabled:opacity-50"
      >
        <option value="" disabled>
          {exporting ? 'Exporting…' : 'Export as ZIP…'}
        </option>
        <option value="md">Markdown</option>
        <option value="html">HTML</option>
        <option value="txt">Plain text</option>
        <option value="docx">Word</option>
        <option value="epub">EPUB</option>
        <option value="tex">LaTeX</option>
      </select>

      {/* Delete */}
      <button
        type="button"
        onClick={handleTrash}
        className="px-2 py-1 text-xs rounded border border-[var(--border)] text-[var(--muted)] hover:text-red-600 hover:border-red-400 inline-flex items-center gap-1"
      >
        <span aria-hidden className="material-symbols-rounded text-[16px]">
          delete
        </span>
        Delete
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

// ─── Single list-mode row (supports right-click context menu) ────────────────

interface DocListRowProps {
  doc: DocDTO
  view: 'recents' | 'starred' | 'trash' | 'tag' | 'all'
  fmt: Intl.DateTimeFormat
  selected: boolean
  orderedIds: string[]
  onToggle: (docId: string, shiftKey: boolean, orderedIds: string[]) => void
  /** S5-5: row-body click gestures (single / ⌘ / shift). */
  onRowSelect: (
    docId: string,
    mods: { meta: boolean; shift: boolean },
    orderedIds: string[],
  ) => void
  /** S5-5: double-click opens the doc. */
  onOpen: (docId: string) => void
  onRefresh: () => void
  allTags: TagDTO[]
  onTagsChanged?: (() => void) | undefined
  navigateTo: (folderId: string | null) => void
  onSetView: (v: 'all') => void
}

function DocListRow({
  doc,
  view,
  fmt,
  selected,
  orderedIds,
  onToggle,
  onRowSelect,
  onOpen,
  onRefresh,
  allTags,
  onTagsChanged,
  navigateTo,
  onSetView,
}: DocListRowProps) {
  const [rowContextMenu, setRowContextMenu] = useState<{ x: number; y: number } | null>(null)

  return (
    <li>
      {/* S5-5: row-body gestures — single-click selects (--selection-bg pill),
          double-click opens, ⌘/Ctrl/shift extend selection; right-click keeps
          the context menu. The <a> stays for keyboard / middle-click. */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: row gestures are convenience; the <a> + checkbox + ⋯ are the keyboard-accessible paths */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: keyboard users open via the <a> and select via the checkbox; the row click is a pointer convenience only */}
      <div
        className={[
          'group/row flex items-center justify-between py-2 gap-2 rounded px-1',
          // LT6-1: active/selected row = the --primary-surface pill (matches the
          // sidebar NavRow active pill); AA in light + dark via
          // --primary-surface-text. LT6-2: idle rows hover to --surface-hover.
          selected
            ? 'bg-[var(--primary-surface)] text-[var(--primary-surface-text)]'
            : 'group-hover/row:bg-[var(--surface-hover)] hover:bg-[var(--surface-hover)]',
        ].join(' ')}
        onClick={(e) => {
          // Ignore clicks that originate on the interactive children (checkbox,
          // link, action buttons) — those have their own handlers.
          if ((e.target as HTMLElement).closest('a,button,input')) return
          onRowSelect(doc.id, { meta: e.metaKey || e.ctrlKey, shift: e.shiftKey }, orderedIds)
        }}
        onDoubleClick={(e) => {
          if ((e.target as HTMLElement).closest('button,input')) return
          onOpen(doc.id)
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          setRowContextMenu({ x: e.clientX, y: e.clientY })
        }}
      >
        <input
          type="checkbox"
          checked={selected}
          aria-label={`Select ${doc.title}`}
          onClick={(e) => onToggle(doc.id, e.shiftKey, orderedIds)}
          onChange={() => {
            // handled by onClick to capture shiftKey
          }}
          className="rounded shrink-0"
        />
        <a
          href={`/d/${doc.id}`}
          className="flex-1 flex items-center gap-2 font-medium hover:text-[var(--primary)] truncate"
        >
          <DocGlyph />
          <span className="truncate">{doc.title}</span>
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
          navigateTo={navigateTo}
          onSetView={onSetView}
        />
      </div>
      {rowContextMenu !== null && (
        <ContextMenu
          state={{ doc, x: rowContextMenu.x, y: rowContextMenu.y }}
          onClose={() => setRowContextMenu(null)}
          onRefresh={onRefresh}
          navigateTo={navigateTo}
          onSetView={onSetView}
        />
      )}
    </li>
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
  /** S5-5: row-body click gestures (single / ⌘ / shift). */
  onRowSelect: (
    docId: string,
    mods: { meta: boolean; shift: boolean },
    orderedIds: string[],
  ) => void
  /** S5-5: double-click opens the doc. */
  onOpen: (docId: string) => void
  onSelectAll: (allIds: string[]) => void
  navigateTo: (folderId: string | null) => void
  onSetView: (v: 'all') => void
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
  onRowSelect,
  onOpen,
  onSelectAll,
  navigateTo,
  onSetView,
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

  // S5-4: the column sort arrow is a Material glyph (no ↑/↓ emoji char). The
  // ACTIVE column shows its real direction at full opacity; every other sortable
  // column shows a faint `unfold_more` affordance (hidden until the header is
  // hovered, then 40% opacity) so the whole row reads as sortable. aria-hidden —
  // aria-sort on the <th> conveys the state to assistive tech.
  const SortArrow = ({ active }: { active: boolean }) =>
    active ? (
      <span aria-hidden className="material-symbols-rounded text-[16px] align-middle">
        {sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward'}
      </span>
    ) : (
      <span
        aria-hidden
        className="material-symbols-rounded text-[16px] align-middle opacity-0 transition-opacity group-hover:opacity-40"
      >
        unfold_more
      </span>
    )

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
            <DocListRow
              key={doc.id}
              doc={doc}
              view={view}
              fmt={fmt}
              selected={selected.has(doc.id)}
              orderedIds={orderedIds}
              onToggle={onToggle}
              onRowSelect={onRowSelect}
              onOpen={onOpen}
              onRefresh={onRefresh}
              allTags={allTags}
              onTagsChanged={onTagsChanged}
              navigateTo={navigateTo}
              onSetView={onSetView}
            />
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
                onDoubleClick={() => onOpen(doc.id)}
                className={[
                  'flex flex-col gap-1 p-3 pl-8 border rounded-lg transition-colors h-full',
                  // LT6-1: active grid card = --primary-surface pill (AA light + dark).
                  selected.has(doc.id)
                    ? 'border-[var(--primary)] bg-[var(--primary-surface)] text-[var(--primary-surface-text)]'
                    : 'border-[var(--border)] bg-[var(--paper)] hover:border-[var(--primary)]',
                ].join(' ')}
              >
                <DocGlyph size={32} />
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
              className="group hover:text-[var(--foreground)]"
            >
              Name <SortArrow active={sortKey === 'name'} />
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
              className="group hover:text-[var(--foreground)]"
            >
              Modified <SortArrow active={sortKey === 'modified'} />
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
              className="group hover:text-[var(--foreground)]"
            >
              Created <SortArrow active={sortKey === 'created'} />
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
              className="group hover:text-[var(--foreground)]"
            >
              Size <SortArrow active={sortKey === 'size'} />
            </button>
          </th>
          <th scope="col" className="text-left py-2 font-medium">
            Actions
          </th>
        </tr>
      </thead>
      <tbody>
        {docs.map((doc) => (
          <tr
            key={doc.id}
            // S5-5: row-body gestures on the details row too (single / double /
            // ⌘ / shift); the checkbox + link keep their own handlers.
            onClick={(e) => {
              if ((e.target as HTMLElement).closest('a,button,input')) return
              onRowSelect(doc.id, { meta: e.metaKey || e.ctrlKey, shift: e.shiftKey }, orderedIds)
            }}
            onDoubleClick={(e) => {
              if ((e.target as HTMLElement).closest('button,input')) return
              onOpen(doc.id)
            }}
            className={[
              'group/row border-b border-[var(--border)]',
              // LT6-1: active details row = --primary-surface pill (AA light + dark).
              selected.has(doc.id)
                ? 'bg-[var(--primary-surface)] text-[var(--primary-surface-text)]'
                : 'hover:bg-[var(--surface-hover)]',
            ].join(' ')}
          >
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
                className="flex items-center gap-2 font-medium hover:text-[var(--primary)] truncate max-w-xs"
              >
                <DocGlyph />
                <span className="truncate">{doc.title}</span>
              </a>
            </td>
            {/* LT6-5: fixed-width (w-24 / 96px) left-aligned date columns so the
                Modified/Created columns don't jitter as dates vary in length. */}
            <td className="w-24 py-2 pr-3 text-left text-[var(--muted)] text-xs whitespace-nowrap">
              <time dateTime={doc.updatedAt}>{fmt.format(new Date(doc.updatedAt))}</time>
            </td>
            <td className="w-24 py-2 pr-3 text-left text-[var(--muted)] text-xs whitespace-nowrap">
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
                navigateTo={navigateTo}
                onSetView={onSetView}
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
  /** S5-5: row-body click gestures (single / ⌘ / shift). */
  onRowSelect: (mods: { meta: boolean; shift: boolean }) => void
  /** S5-5: double-click opens the doc. */
  onOpen: () => void
  onRefresh: () => void
  navigateTo: (folderId: string | null) => void
  onSetView: (v: 'all') => void
}

function AllViewDocRow({
  doc,
  allTags,
  selected,
  onToggle,
  onRowSelect,
  onOpen,
  onRefresh,
  navigateTo,
  onSetView,
}: AllViewDocRowProps) {
  const [showTagPopover, setShowTagPopover] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)

  return (
    // S5-5: row-body gestures (single / double / ⌘ / shift); right-click menu kept.
    // biome-ignore lint/a11y/noStaticElementInteractions: row gestures are convenience; the <a> + checkbox + ⋯ are the keyboard-accessible paths
    // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard users open via the <a> and select via the checkbox; the row click is a pointer convenience only
    <div
      className={[
        'group/row flex items-center justify-between py-2 gap-2 rounded px-1',
        // LT6-1: active all-view row = --primary-surface pill (AA light + dark).
        // LT6-2: idle rows hover to --surface-hover (was no hover bg).
        selected
          ? 'bg-[var(--primary-surface)] text-[var(--primary-surface-text)]'
          : 'group-hover/row:bg-[var(--surface-hover)] hover:bg-[var(--surface-hover)]',
      ].join(' ')}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('a,button,input')) return
        onRowSelect({ meta: e.metaKey || e.ctrlKey, shift: e.shiftKey })
      }}
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest('button,input')) return
        onOpen()
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        setContextMenu({ x: e.clientX, y: e.clientY })
      }}
    >
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
        className="flex-1 flex items-center gap-2 font-medium hover:text-[var(--primary)]"
      >
        <DocGlyph />
        <span className="truncate">{doc.title}</span>
      </a>
      <time dateTime={doc.updatedAt} className="text-[var(--muted)] text-xs shrink-0 ml-4">
        {new Intl.DateTimeFormat('en', {
          dateStyle: 'medium',
          timeStyle: 'short',
        }).format(new Date(doc.updatedAt))}
      </time>
      {/* S5-4 Drive parity: action controls hidden until row hover
          (`group-hover/row`) or keyboard focus within the row
          (`group-focus-within/row`), so they stay reachable via Tab. */}
      <div className="flex items-center gap-1 shrink-0 opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100">
        <div className="relative shrink-0">
          <Tooltip label={`Edit tags for ${doc.title}`}>
            <button
              type="button"
              onClick={() => setShowTagPopover((v) => !v)}
              aria-label={`Edit tags for ${doc.title}`}
              className="px-interactive flex h-8 w-8 items-center justify-center text-[var(--muted)]"
            >
              <span aria-hidden className="material-symbols-rounded text-[20px]">
                label
              </span>
            </button>
          </Tooltip>
          {showTagPopover && (
            <TagPopover
              docId={doc.id}
              docTitle={doc.title}
              allTags={allTags}
              onClose={() => setShowTagPopover(false)}
            />
          )}
        </div>
        {/* ⋯ More button */}
        <Tooltip label={`Actions for ${doc.title}`} className="shrink-0">
          <button
            type="button"
            aria-label={`Actions for ${doc.title}`}
            onClick={(e) => {
              const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect()
              setContextMenu({ x: rect.left, y: rect.bottom + 4 })
            }}
            className="px-interactive flex h-8 w-8 items-center justify-center text-[var(--muted)]"
          >
            <span aria-hidden className="material-symbols-rounded text-[20px]">
              more_horiz
            </span>
          </button>
        </Tooltip>
      </div>
      {contextMenu !== null && (
        <ContextMenu
          state={{ doc, x: contextMenu.x, y: contextMenu.y }}
          onClose={() => setContextMenu(null)}
          onRefresh={onRefresh}
          navigateTo={navigateTo}
          onSetView={onSetView}
        />
      )}
    </div>
  )
}

// ─── Trash toolbar (E11) ─────────────────────────────────────────────────────

interface TrashToolbarProps {
  docCount: number
  onAfterEmpty: () => void
}

function TrashToolbar({ docCount, onAfterEmpty }: TrashToolbarProps) {
  const [retentionDays, setRetentionDaysState] = useState<number>(30)
  const [showDialog, setShowDialog] = useState(false)
  const [confirmPhrase, setConfirmPhrase] = useState('')
  const [emptying, setEmptying] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)

  // Load retention setting on mount
  useEffect(() => {
    fetch('/api/settings/trash-retention')
      .then((r) => r.json() as Promise<{ days: number }>)
      .then((data) => setRetentionDaysState(data.days))
      .catch(() => {
        // leave default
      })
  }, [])

  const handleRetentionChange = async (val: number) => {
    const clamped = Math.max(0, Math.round(val))
    setRetentionDaysState(clamped)
    try {
      await fetch('/api/settings/trash-retention', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ days: clamped }),
      })
    } catch {
      // leave state
    }
  }

  // Close dialog on Escape
  useEffect(() => {
    if (!showDialog) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowDialog(false)
        setConfirmPhrase('')
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [showDialog])

  const handleEmptyConfirm = async () => {
    setEmptying(true)
    try {
      const res = await fetch('/api/trash/empty', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirm: confirmPhrase }),
      })
      if (res.ok) {
        setShowDialog(false)
        setConfirmPhrase('')
        onAfterEmpty()
      }
    } catch {
      // leave state
    } finally {
      setEmptying(false)
    }
  }

  const canConfirm = confirmPhrase.trim().toLowerCase() === 'empty trash'

  return (
    <>
      <div className="flex flex-wrap items-center gap-4 mb-4 p-3 rounded-md border border-[var(--border)] bg-[var(--paper)]">
        {/* Retention control */}
        <div className="flex items-center gap-2 flex-wrap">
          <label
            htmlFor="trash-retention-days"
            className="text-sm text-[var(--foreground)] shrink-0"
          >
            Permanently delete trashed items after
          </label>
          <input
            id="trash-retention-days"
            type="number"
            min="0"
            value={retentionDays}
            onChange={(e) => setRetentionDaysState(Number(e.target.value))}
            onBlur={(e) => handleRetentionChange(Number(e.target.value))}
            className="w-20 px-2 py-1 text-sm border border-[var(--border)] rounded bg-[var(--background)] text-[var(--foreground)]"
          />
          <span className="text-sm text-[var(--muted)] shrink-0">days (0 = keep forever)</span>
        </div>

        {/* Empty Trash button */}
        <button
          type="button"
          onClick={() => setShowDialog(true)}
          className="ml-auto px-3 py-1.5 text-sm rounded border border-red-400 text-red-600 hover:bg-red-50 font-medium shrink-0"
        >
          Empty Trash
        </button>
      </div>

      {/* Empty-Trash confirmation dialog */}
      {showDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Empty Trash"
            className="bg-[var(--paper)] border border-[var(--border)] rounded-lg shadow-2xl p-6 w-full max-w-md flex flex-col gap-4"
          >
            <h2 className="text-base font-semibold text-[var(--foreground)]">Empty Trash</h2>
            <p className="text-sm text-[var(--foreground)]">
              Permanently delete all <strong>{docCount}</strong> {docCount === 1 ? 'item' : 'items'}{' '}
              in Trash. This cannot be undone.
            </p>
            <div className="flex flex-col gap-1">
              <label
                htmlFor="empty-trash-confirm"
                className="text-sm font-medium text-[var(--foreground)]"
              >
                Type &lsquo;empty trash&rsquo; to confirm
              </label>
              <input
                id="empty-trash-confirm"
                type="text"
                value={confirmPhrase}
                onChange={(e) => setConfirmPhrase(e.target.value)}
                placeholder="empty trash"
                autoComplete="off"
                className="px-2 py-1.5 text-sm border border-[var(--border)] rounded bg-[var(--background)] text-[var(--foreground)]"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowDialog(false)
                  setConfirmPhrase('')
                }}
                className="px-3 py-1.5 text-sm rounded border border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleEmptyConfirm}
                disabled={!canConfirm || emptying}
                className="px-3 py-1.5 text-sm rounded bg-red-600 text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-red-700"
              >
                {emptying ? 'Deleting…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function FileManager({ initialFolders, initialDocs }: Props) {
  const searchParams = useSearchParams()
  // S5-5: double-click-open routes through the client router (the row keeps its
  // <a href> for keyboard / middle-click; double-click is the primary open).
  const router = useRouter()
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

  // H9: Import state
  const importInputRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [importWarnings, setImportWarnings] = useState<string[]>([])

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

  // S5-5: double-click-open helper, shared by every row renderer.
  const openDoc = useCallback((docId: string) => router.push(`/d/${docId}`), [router])

  // S5-5: the row-body click reducer (Drive gestures). Routes the EXISTING pure
  // selection.ts logic — no new selection capability:
  //   • plain click  → selectOnly (collapse to this one row)
  //   • ⌘/Ctrl click → toggle into/out of the set (multi)
  //   • shift click  → rangeBetween from the anchor (range), via handleToggle
  // Double-click-open and right-click-menu are wired in the row components.
  const handleRowSelect = useCallback(
    (docId: string, mods: { meta: boolean; shift: boolean }, orderedIds: string[]) => {
      if (mods.shift && anchorId !== null) {
        handleToggle(docId, true, orderedIds)
        return
      }
      if (mods.meta) {
        setSelected((prev) => toggleSelection(prev, docId))
        setAnchorId(docId)
        return
      }
      setSelected(selectOnly(docId))
      setAnchorId(docId)
    },
    [anchorId, handleToggle],
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

  // H9: handle file import via /api/docs/import
  const handleImportFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    // Reset input so the same file can be re-imported
    e.target.value = ''
    setImporting(true)
    setImportWarnings([])
    try {
      const body = new FormData()
      body.append('file', file)
      const res = await fetch('/api/docs/import', { method: 'POST', body })
      if (res.status === 415) {
        window.alert('Unsupported file type. Please upload a .docx, .md, .html, or Notion .zip.')
        return
      }
      if (res.status === 413) {
        window.alert('File is too large (max 25 MB).')
        return
      }
      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        window.alert(`Import failed: ${data.error ?? res.statusText}`)
        return
      }
      const data = (await res.json()) as { id: string; warnings: string[] }
      if (data.warnings.length > 0) {
        setImportWarnings(data.warnings)
      }
      // Navigate to the new document
      window.location.href = `/d/${data.id}`
    } catch {
      window.alert('Import failed: network error.')
    } finally {
      setImporting(false)
    }
  }, [])

  const handleNewFolder = useCallback(async () => {
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
  }, [currentFolderId, fetchFolders])

  // S2-4: surface the sidebar's routeless Drive views (`/files?view=starred`
  // etc.) into the existing `view` state. The routeless views (Recents/Starred/
  // Shared) have no dedicated route, so the sidebar links here with a query
  // param; this reads it into existing state (no new view logic). Files/Trash
  // have their own routes and never reach this code via `?view=`.
  const viewParam = searchParams.get('view')
  useEffect(() => {
    setView(normalizeFilesView(viewParam))
    setActiveSmartId(null)
    setActiveTagId(null)
    clearSelection()
  }, [viewParam, clearSelection])

  // S2-1: the "+ New" mega-menu routes here with `?new=folder|upload` to invoke
  // the EXISTING folder / import handlers (the create logic is unchanged; only
  // the trigger is surfaced from the global sidebar). A ref guards against the
  // handler firing more than once for a given navigation (replaceState clears
  // the URL but does not refresh React's searchParams, so without the guard a
  // later unrelated re-render would re-open the prompt).
  const newParam = searchParams.get('new')
  const handledNewParam = useRef(false)
  useEffect(() => {
    if (newParam !== 'folder' && newParam !== 'upload') {
      handledNewParam.current = false
      return
    }
    if (handledNewParam.current) return
    handledNewParam.current = true
    const url = new URL(window.location.href)
    url.searchParams.delete('new')
    window.history.replaceState(null, '', url.toString())
    if (newParam === 'folder') {
      void handleNewFolder()
    } else {
      importInputRef.current?.click()
    }
  }, [newParam, handleNewFolder])

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
      {/* S2-4 (sole owner): the duplicate in-component view tab strip
          (<nav aria-label="views">) is removed — All/Recents/Starred/Shared/
          Trash are now reached from the global sidebar nav rows (Files/Trash via
          route; Recents/Starred/Shared via `?view=` surfaced into `view` state
          above). The files-page top is title + Sort + View toggle only. */}

      {/* View content */}
      {(view === 'all' || view === 'smart' || view === 'tag') && (
        <div className="flex gap-6 flex-1 min-h-0">
          {/* Left rail — folder tree + smart folders. Plain wrapper, not an
              <aside> landmark: it sits inside the layout's <main>, and a
              complementary landmark nested in main is flagged by axe
              (landmark-complementary-is-top-level). The folder tree below uses
              <ul>/<li> list semantics for its structure. */}
          <div className="w-56 shrink-0 border-r border-[var(--border)] pr-4 flex flex-col gap-2">
            {/* S5-4/S5-8: the standalone "+ New folder" button is gone — "Folder"
                lives in the sidebar "+ New" mega-menu (S2-1), which routes to
                `?new=folder` → handleNewFolder (still wired below via newParam). */}

            {/* H9: Import button + hidden file input */}
            <label
              className={[
                'rounded-md border border-[var(--border)] px-3 py-1.5 font-medium text-sm text-[var(--foreground)] cursor-pointer text-center inline-flex items-center justify-center gap-1',
                importing
                  ? 'opacity-50 cursor-wait'
                  : 'hover:border-[var(--primary)] hover:text-[var(--primary)]',
              ].join(' ')}
              aria-label="Import document"
              aria-busy={importing}
            >
              <span aria-hidden className="material-symbols-rounded text-[18px]">
                upload
              </span>
              {importing ? 'Importing…' : 'Import'}
              <input
                ref={importInputRef}
                type="file"
                accept=".docx,.md,.markdown,.html,.htm,.zip"
                className="sr-only"
                onChange={handleImportFile}
              />
            </label>

            {/* Import warnings (surface after redirect fallback — shown briefly) */}
            {importWarnings.length > 0 && (
              <div
                role="alert"
                className="text-xs text-amber-700 bg-amber-50 border border-amber-300 rounded p-2 flex flex-col gap-1"
              >
                <p className="font-medium">
                  Imported with {importWarnings.length} warning
                  {importWarnings.length === 1 ? '' : 's'}:
                </p>
                <ul className="list-disc list-inside">
                  {importWarnings.map((w, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: static warning list
                    <li key={i}>{w}</li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => setImportWarnings([])}
                  className="self-end text-xs text-amber-600 hover:underline mt-1"
                >
                  Dismiss
                </button>
              </div>
            )}

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
                    'flex w-full items-center gap-2 rounded px-2 py-1 text-sm text-left transition-colors duration-150',
                    over
                      ? 'bg-[var(--primary)] text-[var(--on-primary)]'
                      : currentFolderId === null
                        ? 'font-semibold text-[var(--foreground)]'
                        : 'text-[var(--muted)]',
                  ].join(' ')}
                >
                  <FolderGlyph home />
                  Root
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

            {/* Smart Folders section — S5-4: indented under the tree (pl-2),
                smaller overline header. */}
            <div className="mt-4 flex flex-col gap-1 pl-2">
              <p className="text-[11px] font-semibold text-[var(--muted)] uppercase tracking-wide px-1">
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
                        'flex-1 flex items-center gap-2 text-left px-2 py-1 text-sm rounded truncate',
                        view === 'smart' && activeSmartId === sf.id
                          ? 'font-semibold text-[var(--primary)]'
                          : 'text-[var(--foreground)] hover:text-[var(--primary)]',
                      ].join(' ')}
                    >
                      <span aria-hidden className="material-symbols-rounded text-[18px]">
                        search
                      </span>
                      <span className="truncate">{sf.name}</span>
                    </button>
                    <Tooltip label={`Delete smart folder ${sf.name}`} className="shrink-0">
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
                        className="flex h-6 w-6 items-center justify-center text-[var(--muted)] hover:text-red-600"
                      >
                        <span aria-hidden className="material-symbols-rounded text-[16px]">
                          close
                        </span>
                      </button>
                    </Tooltip>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => setShowCreateForm((v) => !v)}
                className="text-xs text-[var(--muted)] hover:text-[var(--primary)] text-left px-2 py-1"
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

            {/* Tags section — S5-4: indented (pl-2), smaller overline header,
                6px square tag dot left of the name. */}
            <div className="mt-4 flex flex-col gap-1 pl-2">
              <p className="text-[11px] font-semibold text-[var(--muted)] uppercase tracking-wide px-1">
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
                            ? 'font-semibold text-[var(--primary)]'
                            : 'text-[var(--foreground)] hover:text-[var(--primary)]',
                        ].join(' ')}
                      >
                        <span
                          aria-hidden="true"
                          className="inline-block w-1.5 h-1.5 rounded-[1px] shrink-0"
                          style={{ backgroundColor: tc.bg }}
                        />
                        <span className="truncate">{tag.name}</span>
                        <span className="text-[var(--muted)] text-xs ml-auto shrink-0">
                          {tag.count}
                        </span>
                      </button>
                      <Tooltip label={`Delete tag ${tag.name}`} className="shrink-0">
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
                          className="flex h-6 w-6 items-center justify-center text-[var(--muted)] hover:text-red-600"
                        >
                          <span aria-hidden className="material-symbols-rounded text-[16px]">
                            close
                          </span>
                        </button>
                      </Tooltip>
                    </li>
                  )
                })}
              </ul>
              <button
                type="button"
                onClick={() => setShowTagCreateForm((v) => !v)}
                className="text-xs text-[var(--muted)] hover:text-[var(--primary)] text-left px-2 py-1"
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
          </div>

          {/* Main panel — plain wrapper, NOT a <main> landmark: the (app) layout
              already provides the page's single <main id="main-content">, so a
              nested <main> here would create a duplicate landmark (K1: one <main>
              per page). */}
          <div className="flex-1 min-w-0">
            {view === 'all' && (
              <>
                {/* Breadcrumb — each crumb is also a drop target (E8): drag a doc
                    or folder onto a crumb to reparent it into that folder. */}
                <nav
                  aria-label="folder path"
                  className="flex items-center gap-1 text-sm mb-4 flex-wrap"
                >
                  <DropZone targetFolderId={null} onDropped={onDropped}>
                    {(over, handlers) => (
                      <button
                        type="button"
                        onClick={() => navigateTo(null)}
                        onDragOver={handlers.onDragOver}
                        onDragLeave={handlers.onDragLeave}
                        onDrop={handlers.onDrop}
                        className={[
                          'rounded px-1 hover:underline transition-colors duration-150',
                          over
                            ? 'bg-[var(--primary)] text-[var(--on-primary)]'
                            : 'text-[var(--primary)]',
                        ].join(' ')}
                      >
                        Root
                      </button>
                    )}
                  </DropZone>
                  {breadcrumb.map((segment, index) => {
                    // The final crumb (the current folder) stays fully readable;
                    // intermediate crumbs truncate so a deep path doesn't wrap.
                    const isLast = index === breadcrumb.length - 1
                    return (
                      <span key={segment.id} className="flex items-center gap-1 min-w-0">
                        <span className="text-[var(--muted)] shrink-0" aria-hidden="true">
                          /
                        </span>
                        <DropZone targetFolderId={segment.id} onDropped={onDropped}>
                          {(over, handlers) => (
                            <button
                              type="button"
                              onClick={() => navigateTo(segment.id)}
                              onDragOver={handlers.onDragOver}
                              onDragLeave={handlers.onDragLeave}
                              onDrop={handlers.onDrop}
                              className={[
                                'rounded px-1 hover:underline transition-colors duration-150',
                                isLast ? '' : 'max-w-[200px] truncate',
                                over
                                  ? 'bg-[var(--primary)] text-[var(--on-primary)]'
                                  : 'text-[var(--primary)]',
                              ].join(' ')}
                            >
                              {segment.name}
                            </button>
                          )}
                        </DropZone>
                      </span>
                    )
                  })}
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
                        total={sortedDocs.length}
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
                                  'flex w-full items-center gap-2 py-2 rounded font-medium text-left transition-colors duration-150',
                                  over
                                    ? 'bg-[var(--paper)] text-[var(--primary)]'
                                    : 'hover:text-[var(--primary)]',
                                ].join(' ')}
                              >
                                <FolderGlyph />
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
                                  onRowSelect={(mods) =>
                                    handleRowSelect(
                                      doc.id,
                                      mods,
                                      sortedDocs.map((d) => d.id),
                                    )
                                  }
                                  onOpen={() => router.push(`/d/${doc.id}`)}
                                  onRefresh={() => fetchDocs(currentFolderId)}
                                  navigateTo={navigateTo}
                                  onSetView={(v) => setView(v)}
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
                            onRowSelect={handleRowSelect}
                            onOpen={openDoc}
                            onSelectAll={handleSelectAll}
                            navigateTo={navigateTo}
                            onSetView={(v) => setView(v)}
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
                          total={sortedSmartDocs.length}
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
                          onRowSelect={handleRowSelect}
                          onOpen={openDoc}
                          onSelectAll={handleSelectAll}
                          navigateTo={navigateTo}
                          onSetView={(v) => setView(v)}
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
                          total={sortedTagDocs.length}
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
                          onRowSelect={handleRowSelect}
                          onOpen={openDoc}
                          onSelectAll={handleSelectAll}
                          navigateTo={navigateTo}
                          onSetView={(v) => setView(v)}
                        />
                      </>
                    )}
                  </>
                )
              })()}
          </div>
        </div>
      )}

      {(view === 'recents' || view === 'starred' || view === 'trash') && (
        // Plain wrapper, not a <main> landmark (see note above): the layout owns
        // the page's single <main>.
        <div className="flex-1 min-w-0">
          {view === 'trash' && (
            <TrashToolbar docCount={flatDocs.length} onAfterEmpty={() => fetchFlatDocs('trash')} />
          )}
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
                total={sortedFlatDocs.length}
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
                onRowSelect={handleRowSelect}
                onOpen={openDoc}
                onSelectAll={handleSelectAll}
                navigateTo={navigateTo}
                onSetView={(v) => setView(v)}
              />
            </>
          )}
        </div>
      )}

      {view === 'shared' && (
        // Plain wrapper, not a <main> landmark (see note above): the layout owns
        // the page's single <main>.
        <div className="flex-1 min-w-0 flex items-center justify-center">
          <p className="text-[var(--muted)] text-center">
            Shared documents arrive in v0.2. Parchment v0.1 is single-owner.
          </p>
        </div>
      )}
    </div>
  )
}
