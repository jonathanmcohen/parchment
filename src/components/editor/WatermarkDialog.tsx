'use client'

import { useId, useState } from 'react'
import { WatermarkLayer } from '@/components/editor/WatermarkLayer'
import { DEFAULT_WATERMARK, parseWatermark, type WatermarkConfig } from '@/lib/editor/watermark'

type Props = {
  /** Current doc-level watermark config — seeds the form. */
  initial?: WatermarkConfig
  /** docId is needed to persist via the API. */
  docId: string
  onApply: (cfg: WatermarkConfig) => void
  onClose: () => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export function WatermarkDialog({ initial = DEFAULT_WATERMARK, docId, onApply, onClose }: Props) {
  const titleId = useId()
  const enabledId = useId()
  const kindTextId = useId()
  const kindImageId = useId()
  const textId = useId()
  const colorId = useId()
  const fontSizeId = useId()
  const imageUrlId = useId()
  const opacityId = useId()
  const rotationId = useId()
  const tileId = useId()

  const [enabled, setEnabled] = useState(initial.enabled)
  const [kind, setKind] = useState<'text' | 'image'>(initial.kind)
  const [text, setText] = useState(initial.text)
  const [color, setColor] = useState(initial.color)
  const [fontSize, setFontSize] = useState(initial.fontSize)
  const [imageUrl, setImageUrl] = useState(initial.imageUrl)
  const [opacity, setOpacity] = useState(initial.opacity)
  const [rotation, setRotation] = useState(initial.rotation)
  const [tile, setTile] = useState(initial.tile)
  const [saving, setSaving] = useState(false)

  const buildConfig = (): WatermarkConfig =>
    parseWatermark({ enabled, kind, text, color, fontSize, imageUrl, opacity, rotation, tile })

  const handleApply = async () => {
    const cfg = buildConfig()
    setSaving(true)
    try {
      const res = await fetch(`/api/docs/${docId}/watermark`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ watermark: cfg }),
      })
      if (!res.ok) {
        // Persist failed (e.g. 404 not found / not owned, or 401 unauthorized).
        // Do not update local state or close the dialog — surface the failure.
        setSaving(false)
        return
      }
    } catch {
      // Network error — treat as failure; do not update local state.
      setSaving(false)
      return
    }
    setSaving(false)
    onApply(cfg)
    onClose()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }

  // Live preview config (derived from current form state — not persisted yet)
  const previewCfg = buildConfig()

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop dismiss on click is standard modal UX
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
        className="parchment-dialog parchment-watermark-dialog"
        onKeyDown={handleKeyDown}
      >
        <div className="parchment-dialog-header">
          <h2 id={titleId} className="parchment-dialog-title">
            Watermark
          </h2>
          <button
            type="button"
            aria-label="Close watermark dialog"
            className="parchment-dialog-close"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {/* ── Enable toggle ─────────────────────────────────────────────── */}
        <div className="parchment-dialog-field parchment-dialog-field--inline">
          <label htmlFor={enabledId} className="parchment-dialog-label">
            Enable watermark
          </label>
          <input
            id={enabledId}
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
        </div>

        {enabled && (
          <>
            {/* ── Kind ──────────────────────────────────────────────────── */}
            <fieldset className="parchment-dialog-field">
              <legend className="parchment-dialog-label">Type</legend>
              <label className="parchment-page-setup-radio-label">
                <input
                  id={kindTextId}
                  type="radio"
                  name="watermark-kind"
                  value="text"
                  checked={kind === 'text'}
                  onChange={() => setKind('text')}
                />
                Text
              </label>
              <label className="parchment-page-setup-radio-label">
                <input
                  id={kindImageId}
                  type="radio"
                  name="watermark-kind"
                  value="image"
                  checked={kind === 'image'}
                  onChange={() => setKind('image')}
                />
                Image
              </label>
            </fieldset>

            {/* ── Text-specific fields ──────────────────────────────────── */}
            {kind === 'text' && (
              <>
                <div className="parchment-dialog-field">
                  <label htmlFor={textId} className="parchment-dialog-label">
                    Text
                  </label>
                  <input
                    id={textId}
                    type="text"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="DRAFT"
                    className="parchment-dialog-input"
                  />
                </div>
                <div className="parchment-dialog-field parchment-dialog-field--inline">
                  <label htmlFor={colorId} className="parchment-dialog-label">
                    Color
                  </label>
                  <input
                    id={colorId}
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="parchment-color-input"
                  />
                </div>
                <div className="parchment-dialog-field">
                  <label htmlFor={fontSizeId} className="parchment-dialog-label">
                    Font size (px)
                  </label>
                  <input
                    id={fontSizeId}
                    type="number"
                    min={8}
                    max={300}
                    value={fontSize}
                    onChange={(e) => setFontSize(Number(e.target.value))}
                    className="parchment-dialog-input parchment-page-setup-num"
                  />
                </div>
              </>
            )}

            {/* ── Image-specific fields ─────────────────────────────────── */}
            {kind === 'image' && (
              <div className="parchment-dialog-field">
                <label htmlFor={imageUrlId} className="parchment-dialog-label">
                  Image URL
                </label>
                <input
                  id={imageUrlId}
                  type="url"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://… or /api/docs/…/assets/…"
                  className="parchment-dialog-input"
                />
              </div>
            )}

            {/* ── Shared fields ─────────────────────────────────────────── */}
            <div className="parchment-dialog-field">
              <label htmlFor={opacityId} className="parchment-dialog-label">
                Opacity ({Math.round(opacity * 100)}%)
              </label>
              <input
                id={opacityId}
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={opacity}
                onChange={(e) => setOpacity(Number(e.target.value))}
                className="parchment-watermark-slider"
              />
            </div>

            <div className="parchment-dialog-field">
              <label htmlFor={rotationId} className="parchment-dialog-label">
                Rotation ({rotation}&deg;)
              </label>
              <input
                id={rotationId}
                type="number"
                min={-180}
                max={180}
                value={rotation}
                onChange={(e) => setRotation(Number(e.target.value))}
                className="parchment-dialog-input parchment-page-setup-num"
              />
            </div>

            <div className="parchment-dialog-field parchment-dialog-field--inline">
              <label htmlFor={tileId} className="parchment-dialog-label">
                Tile (repeat across page)
              </label>
              <input
                id={tileId}
                type="checkbox"
                checked={tile}
                onChange={(e) => setTile(e.target.checked)}
              />
            </div>

            {/* ── Live mini-preview ─────────────────────────────────────── */}
            <div role="img" className="parchment-watermark-preview" aria-label="Watermark preview">
              <WatermarkLayer config={previewCfg} />
              {kind === 'text' && previewCfg.enabled && (
                <span className="parchment-watermark-preview-label" aria-hidden="true">
                  preview
                </span>
              )}
            </div>
          </>
        )}

        {/* ── Actions ───────────────────────────────────────────────────── */}
        <div className="parchment-dialog-actions">
          <button type="button" className="parchment-dialog-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="parchment-dialog-btn-primary"
            onClick={() => void handleApply()}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  )
}
