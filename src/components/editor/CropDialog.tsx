'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import {
  type Corner,
  type CropFormat,
  clampRect,
  displayRectToSource,
  extForFormat,
  initialCropRect,
  pickDefaultFormat,
  type Rect,
  resizeCropRect,
} from '@/lib/editor/crop'

type Props = {
  docId: string
  src: string
  alt: string
  sourceType?: string | undefined
  onCropped: (url: string) => void
  onClose: () => void
}

const DISPLAY_MAX = 440
const CORNERS: Corner[] = ['nw', 'ne', 'sw', 'se']
const FORMAT_OPTIONS: { label: string; value: CropFormat }[] = [
  { label: 'PNG', value: 'image/png' },
  { label: 'JPEG', value: 'image/jpeg' },
  { label: 'WebP', value: 'image/webp' },
]

/**
 * Accessible modal that crops `src` to a user-set rectangle, rasterizes the region
 * via an offscreen canvas, uploads the blob to the doc's assets route, and hands the
 * new URL back through `onCropped`. Alt text is preserved by the caller.
 */
export function CropDialog({ docId, src, alt, sourceType, onCropped, onClose }: Props) {
  const titleId = useId()
  const fmtId = useId()
  const imgRef = useRef<HTMLImageElement>(null)

  const [display, setDisplay] = useState<{ width: number; height: number } | null>(null)
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null)
  const [crop, setCrop] = useState<Rect | null>(null)
  const [format, setFormat] = useState<CropFormat>(() => pickDefaultFormat(sourceType, src))
  const [loadError, setLoadError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const dragState = useRef<{
    mode: 'move' | Corner
    startX: number
    startY: number
    startRect: Rect
  } | null>(null)

  const onImgLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const el = e.currentTarget
    const nat = { width: el.naturalWidth, height: el.naturalHeight }
    if (nat.width === 0 || nat.height === 0) {
      setLoadError(true)
      return
    }
    const scale = Math.min(1, DISPLAY_MAX / nat.width, DISPLAY_MAX / nat.height)
    const disp = {
      width: Math.max(1, Math.round(nat.width * scale)),
      height: Math.max(1, Math.round(nat.height * scale)),
    }
    setNatural(nat)
    setDisplay(disp)
    setCrop(initialCropRect(disp))
  }, [])

  // Escape closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Global drag listeners — robust against the pointer leaving the crop frame.
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const st = dragState.current
      if (!st || !display) return
      const dx = e.clientX - st.startX
      const dy = e.clientY - st.startY
      if (st.mode === 'move') {
        setCrop(
          clampRect({ ...st.startRect, x: st.startRect.x + dx, y: st.startRect.y + dy }, display),
        )
      } else {
        setCrop(resizeCropRect(st.startRect, st.mode, dx, dy, display))
      }
    }
    const up = () => {
      dragState.current = null
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [display])

  const startMove = useCallback(
    (e: React.PointerEvent) => {
      if (!crop) return
      e.preventDefault()
      dragState.current = { mode: 'move', startX: e.clientX, startY: e.clientY, startRect: crop }
    },
    [crop],
  )

  const startResize = useCallback(
    (corner: Corner) => (e: React.PointerEvent) => {
      if (!crop) return
      e.preventDefault()
      e.stopPropagation()
      dragState.current = { mode: corner, startX: e.clientX, startY: e.clientY, startRect: crop }
    },
    [crop],
  )

  const apply = useCallback(async () => {
    if (!crop || !display || !natural || !imgRef.current) return
    setBusy(true)
    setError('')
    try {
      const { sx, sy, sw, sh } = displayRectToSource(crop, display, natural)
      const canvas = document.createElement('canvas')
      canvas.width = sw
      canvas.height = sh
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        setError('Crop failed — canvas unavailable.')
        return
      }
      if (format === 'image/jpeg') {
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, sw, sh)
      }
      ctx.drawImage(imgRef.current, sx, sy, sw, sh, 0, 0, sw, sh)
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), format, 0.92)
      })
      if (!blob) {
        setError('Crop failed — try a different format.')
        return
      }
      const file = new File([blob], `cropped.${extForFormat(format)}`, { type: format })
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`/api/docs/${docId}/assets`, { method: 'POST', body: form })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        setError(body.error ?? 'Upload failed.')
        return
      }
      const { url } = (await res.json()) as { url: string }
      onCropped(url)
      onClose()
    } catch (err) {
      if (err instanceof DOMException && err.name === 'SecurityError') {
        setError("Can't crop this image (blocked by its server).")
      } else {
        setError('Crop failed — network or image error.')
      }
    } finally {
      setBusy(false)
    }
  }, [crop, display, natural, format, docId, onCropped, onClose])

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop dismiss is standard modal UX; Escape is handled by the document listener above
    <div
      role="presentation"
      className="parchment-dialog-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="parchment-dialog">
        <div className="parchment-dialog-header">
          <h2 id={titleId} className="parchment-dialog-title">
            Crop image
          </h2>
          <button
            type="button"
            aria-label="Close crop dialog"
            className="parchment-dialog-close"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {loadError ? (
          <p role="alert" className="parchment-dialog-error">
            Could not load the image to crop.
          </p>
        ) : (
          <div className="parchment-crop-stage">
            <div
              className="parchment-crop-frame"
              style={display ? { width: display.width, height: display.height } : undefined}
            >
              {/* biome-ignore lint/performance/noImgElement: crop needs a raw <img> drawn to a canvas with crossOrigin; next/image cannot supply a same-pixel source for drawImage. Decorative preview — real alt is preserved on the document node. */}
              <img
                ref={imgRef}
                src={src}
                alt=""
                crossOrigin="anonymous"
                draggable={false}
                className="parchment-crop-img"
                onLoad={onImgLoad}
                onError={() => setLoadError(true)}
              />
              {crop && (
                <div
                  className="parchment-crop-rect"
                  style={{ left: crop.x, top: crop.y, width: crop.width, height: crop.height }}
                  onPointerDown={startMove}
                >
                  {CORNERS.map((c) => (
                    <span
                      key={c}
                      className={`parchment-crop-handle parchment-crop-handle--${c}`}
                      onPointerDown={startResize(c)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="parchment-dialog-field">
          <label htmlFor={fmtId} className="parchment-dialog-label">
            Output format
          </label>
          <select
            id={fmtId}
            value={format}
            onChange={(e) => setFormat(e.target.value as CropFormat)}
            className="parchment-dialog-select"
          >
            {FORMAT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {alt && <p className="parchment-dialog-label">Alt text preserved: “{alt}”</p>}

        {error && (
          <span role="alert" className="parchment-dialog-error">
            {error}
          </span>
        )}

        <div className="parchment-dialog-actions">
          <button type="button" className="parchment-dialog-btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="parchment-dialog-btn-primary"
            onClick={apply}
            disabled={busy || loadError || !crop}
            aria-busy={busy}
          >
            {busy ? 'Cropping…' : 'Apply crop'}
          </button>
        </div>
      </div>
    </div>
  )
}
