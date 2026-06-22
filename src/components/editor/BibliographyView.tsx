'use client'

import type { NodeViewProps } from '@tiptap/react'
import { NodeViewWrapper } from '@tiptap/react'
import { useCallback, useState } from 'react'
import { fetchDoiCsl } from '@/lib/citations/crossref'
import { formatBibliography } from '@/lib/citations/format'
import type { CiteStyle, CslEntry } from '@/lib/citations/types'
import { parseCslEntries } from '@/lib/citations/types'

const STYLES: { value: CiteStyle; label: string }[] = [
  { value: 'apa', label: 'APA' },
  { value: 'mla', label: 'MLA' },
  { value: 'chicago', label: 'Chicago' },
]

/**
 * G7b: BibliographyView — block NodeView for the `bibliography` node.
 * Renders the formatted reference list with a toolbar:
 *   - style selector (APA/MLA/Chicago)
 *   - "Add by DOI" button (CrossRef lookup, user-initiated)
 *   - "Add manually" button (inline minimal form)
 */
export function BibliographyView({ node, editor, getPos }: NodeViewProps) {
  const refs = parseCslEntries(node.attrs.refs as unknown)
  const style: CiteStyle = (() => {
    const s = node.attrs.style
    if (s === 'apa' || s === 'mla' || s === 'chicago') return s
    return 'apa'
  })()

  const [doiStatus, setDoiStatus] = useState<'idle' | 'loading' | 'error'>('idle')

  // Manual-add form state
  const [showManualForm, setShowManualForm] = useState(false)
  const [manualId, setManualId] = useState('')
  const [manualType, setManualType] = useState<CslEntry['type']>('article-journal')
  const [manualTitle, setManualTitle] = useState('')
  const [manualAuthor, setManualAuthor] = useState('')
  const [manualYear, setManualYear] = useState('')

  const handleStyleChange = useCallback(
    (newStyle: CiteStyle) => {
      if (typeof getPos !== 'function') return
      const pos = getPos()
      if (pos === undefined) return
      editor.commands.updateBibliography(pos, refs, newStyle)
    },
    [editor, getPos, refs],
  )

  const handleAddByDoi = useCallback(async () => {
    const doi =
      typeof window !== 'undefined' ? window.prompt('Enter DOI (e.g. 10.1000/xyz123):') : null
    if (!doi) return
    setDoiStatus('loading')
    const entry = await fetchDoiCsl(doi)
    if (!entry) {
      setDoiStatus('error')
      setTimeout(() => setDoiStatus('idle'), 3000)
      return
    }
    setDoiStatus('idle')
    editor.commands.addReference(entry)
  }, [editor])

  const handleManualAdd = useCallback(() => {
    const id = manualId.trim()
    const title = manualTitle.trim()
    if (!id || !title) return

    const entry: CslEntry = {
      id,
      type: manualType,
      title,
    }
    if (manualAuthor.trim()) {
      const parts = manualAuthor.trim().split(/\s+/)
      const family = parts[parts.length - 1] ?? manualAuthor.trim()
      const given = parts.length > 1 ? parts.slice(0, -1).join(' ') : undefined
      entry.author = [{ family, ...(given ? { given } : {}) }]
    }
    if (manualYear.trim()) {
      const year = Number.parseInt(manualYear.trim(), 10)
      if (Number.isFinite(year)) {
        entry.issued = { 'date-parts': [[year]] }
      }
    }

    editor.commands.addReference(entry)
    // Reset form
    setManualId('')
    setManualType('article-journal')
    setManualTitle('')
    setManualAuthor('')
    setManualYear('')
    setShowManualForm(false)
  }, [editor, manualId, manualType, manualTitle, manualAuthor, manualYear])

  const formatted = formatBibliography(refs, style)

  return (
    <NodeViewWrapper
      contentEditable={false}
      className="parchment-bibliography"
      data-bibliography=""
    >
      <div className="parchment-bibliography-inner">
        {/* Heading */}
        <h2 className="parchment-bibliography-heading">References</h2>

        {/* Reference list */}
        {refs.length === 0 ? (
          <p
            className="parchment-bibliography-empty"
            style={{ color: '#999', fontStyle: 'italic' }}
          >
            No references yet — add by DOI or manually.
          </p>
        ) : (
          <ol className="parchment-bibliography-list">
            {formatted.map(({ id, text }) => (
              <li key={id} className="parchment-bibliography-entry">
                {text}
              </li>
            ))}
          </ol>
        )}

        {/* Toolbar */}
        <div
          className="parchment-bibliography-toolbar"
          style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}
        >
          {/* Style selector */}
          <label htmlFor="parchment-bib-style" style={{ fontSize: '0.85em' }}>
            Style:
          </label>
          <select
            id="parchment-bib-style"
            value={style}
            onChange={(e) => handleStyleChange(e.target.value as CiteStyle)}
            aria-label="Citation style"
            style={{ fontSize: '0.85em' }}
          >
            {STYLES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>

          {/* Add by DOI */}
          <button
            type="button"
            onClick={() => void handleAddByDoi()}
            disabled={doiStatus === 'loading'}
            aria-label="Add reference by DOI"
            style={{ fontSize: '0.85em' }}
          >
            {doiStatus === 'loading' ? 'Looking up…' : 'Add by DOI'}
          </button>
          {doiStatus === 'error' && (
            <span style={{ color: '#c00', fontSize: '0.8em' }} role="alert">
              DOI not found
            </span>
          )}

          {/* Add manually */}
          <button
            type="button"
            onClick={() => setShowManualForm((v) => !v)}
            aria-label="Add reference manually"
            aria-expanded={showManualForm}
            style={{ fontSize: '0.85em' }}
          >
            Add manually
          </button>
        </div>

        {/* Manual add form */}
        {showManualForm && (
          <div
            className="parchment-bibliography-manual-form"
            style={{
              marginTop: '0.5rem',
              display: 'grid',
              gap: '0.4rem',
              gridTemplateColumns: '6rem 1fr',
              fontSize: '0.85em',
            }}
          >
            <label htmlFor="parchment-bib-id">ID *</label>
            <input
              id="parchment-bib-id"
              type="text"
              value={manualId}
              onChange={(e) => setManualId(e.target.value)}
              placeholder="e.g. smith2020"
              required
              aria-required="true"
            />

            <label htmlFor="parchment-bib-type">Type</label>
            <select
              id="parchment-bib-type"
              value={manualType}
              onChange={(e) => setManualType(e.target.value as CslEntry['type'])}
              aria-label="Reference type"
            >
              <option value="article-journal">Journal article</option>
              <option value="book">Book</option>
              <option value="chapter">Chapter</option>
              <option value="webpage">Webpage</option>
              <option value="report">Report</option>
              <option value="thesis">Thesis</option>
            </select>

            <label htmlFor="parchment-bib-title">Title *</label>
            <input
              id="parchment-bib-title"
              type="text"
              value={manualTitle}
              onChange={(e) => setManualTitle(e.target.value)}
              placeholder="Title of the work"
              required
              aria-required="true"
            />

            <label htmlFor="parchment-bib-author">Author</label>
            <input
              id="parchment-bib-author"
              type="text"
              value={manualAuthor}
              onChange={(e) => setManualAuthor(e.target.value)}
              placeholder="Given Family (e.g. Jane Smith)"
            />

            <label htmlFor="parchment-bib-year">Year</label>
            <input
              id="parchment-bib-year"
              type="text"
              value={manualYear}
              onChange={(e) => setManualYear(e.target.value)}
              placeholder="e.g. 2020"
            />

            <div style={{ gridColumn: '2', display: 'flex', gap: '0.4rem' }}>
              <button
                type="button"
                onClick={handleManualAdd}
                disabled={!manualId.trim() || !manualTitle.trim()}
                aria-label="Save manually entered reference"
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => setShowManualForm(false)}
                aria-label="Cancel manual add"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  )
}
