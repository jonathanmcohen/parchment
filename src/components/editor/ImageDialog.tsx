'use client'

import type { Editor } from '@tiptap/core'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { ImagePosition } from '@/lib/editor/extensions/image'

type Props = {
  editor: Editor
  docId: string
  /** When provided, the dialog opens pre-filled with this src (paste/drop flow). */
  prefillSrc?: string | undefined
  onClose: () => void
}

const POSITIONS: { label: string; value: ImagePosition }[] = [
  { label: 'Inline', value: 'inline' },
  { label: 'Wrap left', value: 'wrap-left' },
  { label: 'Wrap right', value: 'wrap-right' },
  { label: 'Break (block)', value: 'break' },
  { label: 'Behind text', value: 'behind' },
]

/**
 * Modal dialog for inserting an image with required alt text.
 * Handles three sources: file upload, URL, and pre-filled src (paste/drop).
 * Alt text is required — cannot submit without it (axe WCAG2 A/AA gate).
 */
export function ImageDialog({ editor, docId, prefillSrc, onClose }: Props) {
  const titleId = useId()
  const altId = useId()
  const urlId = useId()
  const posId = useId()
  const lockId = useId()
  const altRef = useRef<HTMLInputElement>(null)

  const [tab, setTab] = useState<'file' | 'url'>(prefillSrc ? 'url' : 'file')
  const [url, setUrl] = useState(prefillSrc ?? '')
  const [alt, setAlt] = useState('')
  const [position, setPosition] = useState<ImagePosition>('inline')
  const [lockAspect, setLockAspect] = useState(true)
  const [altError, setAltError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // When dialog opens with a prefill src (paste/drop), focus the alt field.
  useEffect(() => {
    if (prefillSrc) {
      altRef.current?.focus()
    }
  }, [prefillSrc])

  const validate = useCallback((): boolean => {
    if (!alt.trim()) {
      setAltError('Alt text is required for accessibility.')
      altRef.current?.focus()
      return false
    }
    setAltError('')
    return true
  }, [alt])

  const doInsert = useCallback(
    (src: string) => {
      editor.commands.insertImage({ src, alt: alt.trim(), position, lockAspect })
      onClose()
    },
    [editor, alt, position, lockAspect, onClose],
  )

  const handleUrlSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      if (!validate()) return
      if (!url.trim()) {
        setUploadError('Please enter an image URL.')
        return
      }
      doInsert(url.trim())
    },
    [validate, url, doInsert],
  )

  const handleFileSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (!validate()) return
      const file = fileRef.current?.files?.[0]
      if (!file) {
        setUploadError('Please select a file.')
        return
      }
      setUploading(true)
      setUploadError('')
      try {
        const form = new FormData()
        form.append('file', file)
        const res = await fetch(`/api/docs/${docId}/assets`, { method: 'POST', body: form })
        if (!res.ok) {
          const body = (await res.json()) as { error?: string }
          setUploadError(body.error ?? 'Upload failed.')
          return
        }
        const { url: uploaded } = (await res.json()) as { url: string }
        doInsert(uploaded)
      } catch {
        setUploadError('Network error during upload.')
      } finally {
        setUploading(false)
      }
    },
    [validate, docId, doInsert],
  )

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop dismiss on click is standard modal UX; keyboard close is handled by the inner dialog's onKeyDown
    <div
      role="presentation"
      className="parchment-dialog-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="parchment-dialog"
        onKeyDown={handleKeyDown}
      >
        <div className="parchment-dialog-header">
          <h2 id={titleId} className="parchment-dialog-title">
            Insert image
          </h2>
          <button
            type="button"
            aria-label="Close image dialog"
            className="parchment-dialog-close"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {/* Tab switcher — only show when no prefillSrc */}
        {!prefillSrc && (
          <div className="parchment-dialog-tabs" role="tablist" aria-label="Image source">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'file'}
              className="parchment-dialog-tab"
              onClick={() => setTab('file')}
            >
              Upload file
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'url'}
              className="parchment-dialog-tab"
              onClick={() => setTab('url')}
            >
              From URL
            </button>
          </div>
        )}

        {/* Alt text — always visible, always required */}
        <div className="parchment-dialog-field">
          <label htmlFor={altId} className="parchment-dialog-label">
            Alt text{' '}
            <span aria-hidden="true" className="parchment-dialog-required">
              *
            </span>
          </label>
          <input
            id={altId}
            ref={altRef}
            type="text"
            aria-required="true"
            aria-describedby={altError ? `${altId}-error` : undefined}
            value={alt}
            onChange={(e) => {
              setAlt(e.target.value)
              if (altError && e.target.value.trim()) setAltError('')
            }}
            placeholder="Describe the image for screen readers"
            className="parchment-dialog-input"
          />
          {altError && (
            <span id={`${altId}-error`} role="alert" className="parchment-dialog-error">
              {altError}
            </span>
          )}
        </div>

        {/* Position */}
        <div className="parchment-dialog-field">
          <label htmlFor={posId} className="parchment-dialog-label">
            Position
          </label>
          <select
            id={posId}
            value={position}
            onChange={(e) => setPosition(e.target.value as ImagePosition)}
            className="parchment-dialog-select"
          >
            {POSITIONS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        {/* Lock aspect ratio */}
        <div className="parchment-dialog-field parchment-dialog-field--inline">
          <input
            id={lockId}
            type="checkbox"
            checked={lockAspect}
            onChange={(e) => setLockAspect(e.target.checked)}
            className="parchment-dialog-checkbox"
          />
          <label htmlFor={lockId} className="parchment-dialog-label">
            Lock aspect ratio
          </label>
        </div>

        {uploadError && (
          <span role="alert" className="parchment-dialog-error">
            {uploadError}
          </span>
        )}

        {/* Source-specific form */}
        {tab === 'file' && !prefillSrc ? (
          <form onSubmit={handleFileSubmit} className="parchment-dialog-form">
            <div className="parchment-dialog-field">
              <label htmlFor={`${urlId}-file`} className="parchment-dialog-label">
                Image file
              </label>
              <input
                id={`${urlId}-file`}
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
                className="parchment-dialog-file-input"
              />
            </div>
            <div className="parchment-dialog-actions">
              <button type="button" className="parchment-dialog-btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button
                type="submit"
                className="parchment-dialog-btn-primary"
                disabled={uploading}
                aria-busy={uploading}
              >
                {uploading ? 'Uploading…' : 'Insert'}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleUrlSubmit} className="parchment-dialog-form">
            <div className="parchment-dialog-field">
              <label htmlFor={urlId} className="parchment-dialog-label">
                Image URL
              </label>
              <input
                id={urlId}
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/image.png"
                className="parchment-dialog-input"
                readOnly={!!prefillSrc}
              />
            </div>
            <div className="parchment-dialog-actions">
              <button type="button" className="parchment-dialog-btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="parchment-dialog-btn-primary">
                Insert
              </button>
            </div>
          </form>
        )}

        {/* TODO(B5): full crop — implement a canvas-based crop dialog in a follow-up.
            v0.1 delivers resize handles (drag corners) + position + lock-aspect.
            Full crop (select rect → produce new cropped asset) is deferred. */}
      </div>
    </div>
  )
}
