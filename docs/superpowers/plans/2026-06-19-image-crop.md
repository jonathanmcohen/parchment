# Image Crop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the B5 crop stub with a real canvas-based crop that produces a cropped asset, uploads it via the existing assets route, and swaps the image `src` while preserving alt text.

**Architecture:** A pure crop-rect math module (`src/lib/editor/crop.ts`, unit-tested) feeds a reusable accessible `CropDialog` that draws the selected source region onto an offscreen canvas, uploads the blob, and hands the new URL to its caller. Three entry points reuse that dialog: a gated toolbar button, an overlay button on the selected image (via a `CustomEvent`), and a crop step inside the insert dialog.

**Tech Stack:** Next.js 16 (React 19), Tiptap/ProseMirror, TypeScript 6 strict, Vitest, Biome.

## Global Constraints

- TypeScript strict; no `any` leaks — cast ProseMirror attrs as needed.
- Biome: single quotes, no semicolons, 2-space indent, line width 100.
- Styling via existing CSS vars only (`--paper`, `--border`, `--accent-contrast`, `--foreground`, `--muted`, `--background`); class prefix `parchment-`.
- Accessible dialog: `role="dialog"`, `aria-modal`, labelled title, Escape closes, backdrop-click closes — match existing `ImageDialog`.
- Unit tests live in `tests/unit/*.test.ts`; pure math runs in the Vitest `node` env (no DOM).
- Cropped asset uploads through the existing `POST /api/docs/[id]/assets` (FormData `file` field → `{ url }`). No new routes.
- Alt text must survive every crop.

---

### Task 1: Pure crop-rect math + unit tests

**Files:**
- Create: `src/lib/editor/crop.ts`
- Test: `tests/unit/crop.test.ts`

**Interfaces:**
- Produces: `Rect`, `Size`, `SourceRect`, `Corner`, `CropFormat`; `initialCropRect(display, fraction?)`, `clampRect(rect, bounds, minSize?)`, `resizeCropRect(rect, corner, dx, dy, bounds, minSize?)`, `displayRectToSource(rect, display, natural)`, `pickDefaultFormat(mime, src)`, `extForFormat(format)`.

- [ ] **Step 1: Write the failing test** — `tests/unit/crop.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import {
  clampRect,
  displayRectToSource,
  extForFormat,
  initialCropRect,
  pickDefaultFormat,
  resizeCropRect,
} from '@/lib/editor/crop'

describe('initialCropRect', () => {
  it('centers a default 80% crop', () => {
    expect(initialCropRect({ width: 100, height: 100 })).toEqual({
      x: 10,
      y: 10,
      width: 80,
      height: 80,
    })
  })

  it('honors an explicit fraction', () => {
    expect(initialCropRect({ width: 200, height: 100 }, 0.5)).toEqual({
      x: 50,
      y: 25,
      width: 100,
      height: 50,
    })
  })
})

describe('clampRect', () => {
  it('keeps a rect inside bounds', () => {
    const r = clampRect({ x: -10, y: -10, width: 50, height: 50 }, { width: 100, height: 100 })
    expect(r).toEqual({ x: 0, y: 0, width: 50, height: 50 })
  })

  it('pushes an oversized rect back inside and caps its size', () => {
    const r = clampRect({ x: 80, y: 80, width: 200, height: 200 }, { width: 100, height: 100 })
    expect(r).toEqual({ x: 0, y: 0, width: 100, height: 100 })
  })

  it('enforces a minimum size', () => {
    const r = clampRect({ x: 10, y: 10, width: 2, height: 2 }, { width: 100, height: 100 }, 16)
    expect(r.width).toBe(16)
    expect(r.height).toBe(16)
  })
})

describe('resizeCropRect', () => {
  const bounds = { width: 100, height: 100 }

  it('grows from the SE corner toward bottom-right', () => {
    const r = resizeCropRect({ x: 10, y: 10, width: 20, height: 20 }, 'se', 10, 10, bounds)
    expect(r).toEqual({ x: 10, y: 10, width: 30, height: 30 })
  })

  it('grows from the NW corner toward top-left (anchors SE)', () => {
    const r = resizeCropRect({ x: 30, y: 30, width: 20, height: 20 }, 'nw', -10, -10, bounds)
    expect(r).toEqual({ x: 20, y: 20, width: 30, height: 30 })
  })

  it('floors at the minimum size when dragged past the anchor', () => {
    const r = resizeCropRect({ x: 10, y: 10, width: 20, height: 20 }, 'se', -100, -100, bounds, 16)
    expect(r.width).toBe(16)
    expect(r.height).toBe(16)
  })

  it('clamps the moving edge to the image bounds', () => {
    const r = resizeCropRect({ x: 10, y: 10, width: 20, height: 20 }, 'se', 1000, 1000, bounds)
    expect(r).toEqual({ x: 10, y: 10, width: 90, height: 90 })
  })
})

describe('displayRectToSource', () => {
  it('is identity at 1:1 scale', () => {
    const s = displayRectToSource(
      { x: 10, y: 20, width: 30, height: 40 },
      { width: 100, height: 100 },
      { width: 100, height: 100 },
    )
    expect(s).toEqual({ sx: 10, sy: 20, sw: 30, sh: 40 })
  })

  it('scales up to natural resolution', () => {
    const s = displayRectToSource(
      { x: 10, y: 10, width: 40, height: 40 },
      { width: 100, height: 100 },
      { width: 200, height: 200 },
    )
    expect(s).toEqual({ sx: 20, sy: 20, sw: 80, sh: 80 })
  })

  it('rounds non-integer ratios', () => {
    const s = displayRectToSource(
      { x: 0, y: 0, width: 33, height: 33 },
      { width: 100, height: 100 },
      { width: 150, height: 150 },
    )
    expect(s).toEqual({ sx: 0, sy: 0, sw: 50, sh: 50 })
  })

  it('clamps a crop flush to the right/bottom edge', () => {
    const s = displayRectToSource(
      { x: 90, y: 90, width: 20, height: 20 },
      { width: 100, height: 100 },
      { width: 100, height: 100 },
    )
    expect(s.sx + s.sw).toBeLessThanOrEqual(100)
    expect(s.sy + s.sh).toBeLessThanOrEqual(100)
  })
})

describe('pickDefaultFormat', () => {
  it('preserves jpeg/webp/png from mime', () => {
    expect(pickDefaultFormat('image/jpeg', 'x')).toBe('image/jpeg')
    expect(pickDefaultFormat('image/webp', 'x')).toBe('image/webp')
    expect(pickDefaultFormat('image/png', 'x')).toBe('image/png')
  })

  it('falls back to png for gif/svg/unknown mime', () => {
    expect(pickDefaultFormat('image/gif', 'x')).toBe('image/png')
    expect(pickDefaultFormat('image/svg+xml', 'x')).toBe('image/png')
    expect(pickDefaultFormat('application/octet-stream', 'x')).toBe('image/png')
  })

  it('derives from the src extension when mime is absent', () => {
    expect(pickDefaultFormat(undefined, '/a/b.png')).toBe('image/png')
    expect(pickDefaultFormat(undefined, 'https://x/y.jpeg?v=2')).toBe('image/jpeg')
    expect(pickDefaultFormat(undefined, 'blob:nope')).toBe('image/png')
  })
})

describe('extForFormat', () => {
  it('maps mime to file extension', () => {
    expect(extForFormat('image/png')).toBe('png')
    expect(extForFormat('image/jpeg')).toBe('jpg')
    expect(extForFormat('image/webp')).toBe('webp')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm vitest run tests/unit/crop.test.ts`
Expected: FAIL — `Failed to resolve import '@/lib/editor/crop'`.

- [ ] **Step 3: Write minimal implementation** — `src/lib/editor/crop.ts`

```ts
export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface Size {
  width: number
  height: number
}

export interface SourceRect {
  sx: number
  sy: number
  sw: number
  sh: number
}

export type Corner = 'nw' | 'ne' | 'sw' | 'se'

export type CropFormat = 'image/png' | 'image/jpeg' | 'image/webp'

const MIN_CROP = 16

/** Centered default crop covering `fraction` (default 0.8) of the displayed image. */
export function initialCropRect(display: Size, fraction = 0.8): Rect {
  const f = Math.min(Math.max(fraction, 0), 1)
  const width = display.width * f
  const height = display.height * f
  return { x: (display.width - width) / 2, y: (display.height - height) / 2, width, height }
}

/** Clamp a rect into [0,0 .. bounds], capping size to bounds and flooring at minSize. */
export function clampRect(rect: Rect, bounds: Size, minSize = MIN_CROP): Rect {
  const minW = Math.min(minSize, bounds.width)
  const minH = Math.min(minSize, bounds.height)
  const width = Math.min(Math.max(rect.width, minW), bounds.width)
  const height = Math.min(Math.max(rect.height, minH), bounds.height)
  const x = Math.min(Math.max(rect.x, 0), bounds.width - width)
  const y = Math.min(Math.max(rect.y, 0), bounds.height - height)
  return { x, y, width, height }
}

/** Apply a corner-handle drag (display px); normalizes flips, clamps, floors at minSize. */
export function resizeCropRect(
  rect: Rect,
  corner: Corner,
  dx: number,
  dy: number,
  bounds: Size,
  minSize = MIN_CROP,
): Rect {
  let left = rect.x
  let top = rect.y
  let right = rect.x + rect.width
  let bottom = rect.y + rect.height

  if (corner === 'nw' || corner === 'sw') left += dx
  if (corner === 'ne' || corner === 'se') right += dx
  if (corner === 'nw' || corner === 'ne') top += dy
  if (corner === 'sw' || corner === 'se') bottom += dy

  left = Math.max(0, Math.min(left, bounds.width))
  right = Math.max(0, Math.min(right, bounds.width))
  top = Math.max(0, Math.min(top, bounds.height))
  bottom = Math.max(0, Math.min(bottom, bounds.height))

  const normalized: Rect = {
    x: Math.min(left, right),
    y: Math.min(top, bottom),
    width: Math.abs(right - left),
    height: Math.abs(bottom - top),
  }
  return clampRect(normalized, bounds, minSize)
}

/** Map a display-space crop rect to integer source-pixel coords, clamped to natural size. */
export function displayRectToSource(rect: Rect, display: Size, natural: Size): SourceRect {
  const scaleX = display.width > 0 ? natural.width / display.width : 1
  const scaleY = display.height > 0 ? natural.height / display.height : 1
  const sx = Math.max(0, Math.min(Math.round(rect.x * scaleX), natural.width))
  const sy = Math.max(0, Math.min(Math.round(rect.y * scaleY), natural.height))
  const sw = Math.max(1, Math.min(Math.round(rect.width * scaleX), natural.width - sx))
  const sh = Math.max(1, Math.min(Math.round(rect.height * scaleY), natural.height - sy))
  return { sx, sy, sw, sh }
}

/** Choose the default output format: preserve png/jpeg/webp, else fall back to png. */
export function pickDefaultFormat(mime: string | undefined, src: string): CropFormat {
  const fromMime = mime?.toLowerCase()
  if (fromMime === 'image/jpeg' || fromMime === 'image/jpg') return 'image/jpeg'
  if (fromMime === 'image/webp') return 'image/webp'
  if (fromMime === 'image/png') return 'image/png'
  if (fromMime) return 'image/png'
  const ext = src.split('?')[0]?.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'png') return 'image/png'
  return 'image/png'
}

/** File extension for a crop output format. */
export function extForFormat(format: CropFormat): string {
  if (format === 'image/jpeg') return 'jpg'
  if (format === 'image/webp') return 'webp'
  return 'png'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `corepack pnpm vitest run tests/unit/crop.test.ts`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/editor/crop.ts tests/unit/crop.test.ts
git commit -m "feat(B5): pure crop-rect math + unit tests"
```

---

### Task 2: CropDialog component

**Files:**
- Create: `src/components/editor/CropDialog.tsx`

**Interfaces:**
- Consumes: everything from `src/lib/editor/crop.ts`.
- Produces: `CropDialog` with props `{ docId: string; src: string; alt: string; sourceType?: string; onCropped: (url: string) => void; onClose: () => void }`.

- [ ] **Step 1: Write the component** — `src/components/editor/CropDialog.tsx`

```tsx
'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import {
  type Corner,
  type CropFormat,
  type Rect,
  clampRect,
  displayRectToSource,
  extForFormat,
  initialCropRect,
  pickDefaultFormat,
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

  const dragState = useRef<{ mode: 'move' | Corner; startX: number; startY: number; startRect: Rect } | null>(
    null,
  )

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
        setCrop(clampRect({ ...st.startRect, x: st.startRect.x + dx, y: st.startRect.y + dy }, display))
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
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop dismiss is standard modal UX; Escape handled by the document listener above
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
              {/* biome-ignore lint/a11y/useAltText: decorative crop preview; the real alt text is preserved on the document node */}
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
                // biome-ignore lint/a11y/noStaticElementInteractions: pointer-driven crop rectangle; the dialog stays keyboard-operable via its buttons and select
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
```

- [ ] **Step 2: Typecheck**

Run: `corepack pnpm typecheck`
Expected: PASS (no errors).

- [ ] **Step 3: Commit**

```bash
git add src/components/editor/CropDialog.tsx
git commit -m "feat(B5): canvas-based CropDialog component"
```

---

### Task 3: Crop styles

**Files:**
- Modify: `src/app/globals.css` (append after the image-dialog block, ~line 687)

**Interfaces:**
- Consumes: class names emitted by `CropDialog` and the image NodeView (Task 4).

- [ ] **Step 1: Append CSS**

```css
/* ── Image crop (B5 follow-up) ─────────────────────────────────────────── */

.parchment-crop-stage {
  display: flex;
  justify-content: center;
}

.parchment-crop-frame {
  position: relative;
  line-height: 0;
  user-select: none;
  touch-action: none;
  max-width: 100%;
}

.parchment-crop-img {
  display: block;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.parchment-crop-rect {
  position: absolute;
  border: 1px solid var(--accent-contrast);
  box-shadow: 0 0 0 9999px rgb(0 0 0 / 0.4);
  cursor: move;
  box-sizing: border-box;
}

.parchment-crop-handle {
  position: absolute;
  width: 12px;
  height: 12px;
  background: var(--accent-contrast);
  border: 1px solid #fff;
  border-radius: 2px;
  z-index: 1;
}

.parchment-crop-handle--nw {
  top: -6px;
  left: -6px;
  cursor: nw-resize;
}
.parchment-crop-handle--ne {
  top: -6px;
  right: -6px;
  cursor: ne-resize;
}
.parchment-crop-handle--sw {
  bottom: -6px;
  left: -6px;
  cursor: sw-resize;
}
.parchment-crop-handle--se {
  bottom: -6px;
  right: -6px;
  cursor: se-resize;
}

/* Overlay "Crop" button on a selected image */
.parchment-image-crop-btn {
  position: absolute;
  top: 6px;
  left: 6px;
  z-index: 11;
  padding: 2px 8px;
  font-size: 0.72rem;
  font-weight: 500;
  color: #fff;
  background: var(--accent-contrast);
  border: 1px solid #fff;
  border-radius: 4px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.1s;
}

.parchment-image-selected .parchment-image-crop-btn {
  opacity: 1;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(B5): crop dialog + overlay-button styles"
```

---

### Task 4: Overlay crop button in the image NodeView

**Files:**
- Modify: `src/lib/editor/extensions/image.ts`

**Interfaces:**
- Produces: a `CustomEvent('parchment:crop-image')` dispatched on `editor.view.dom` when the overlay button is clicked, after selecting the image node.

- [ ] **Step 1: Add the NodeSelection import** — top of `src/lib/editor/extensions/image.ts`

```ts
import { NodeSelection } from '@tiptap/pm/state'
```

- [ ] **Step 2: Append the crop button inside `buildImageNodeView`** — after the resize-handles `for` loop, before `wrapper.appendChild(img)`

```ts
  // ── Overlay crop button (visible when selected) ─────────────────────────
  const cropBtn = document.createElement('button')
  cropBtn.type = 'button'
  cropBtn.className = 'parchment-image-crop-btn'
  cropBtn.textContent = 'Crop'
  cropBtn.setAttribute('aria-label', 'Crop image')
  // Keep the node selected through the click (don't let mousedown blur/reselect).
  cropBtn.addEventListener('mousedown', (e) => {
    e.preventDefault()
    e.stopPropagation()
  })
  cropBtn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (typeof getPos === 'function') {
      const p = getPos()
      if (p !== undefined) {
        _editor.commands.command(({ tr, dispatch }) => {
          if (dispatch) dispatch(tr.setSelection(NodeSelection.create(tr.doc, p)))
          return true
        })
      }
    }
    _editor.view.dom.dispatchEvent(new CustomEvent('parchment:crop-image', { bubbles: true }))
  })
  wrapper.appendChild(cropBtn)
```

- [ ] **Step 3: Typecheck**

Run: `corepack pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Run the existing image-node tests** (guard against regressions)

Run: `corepack pnpm vitest run tests/unit/image-node.test.ts`
Expected: PASS (8+ tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/editor/extensions/image.ts
git commit -m "feat(B5): overlay crop button on selected image"
```

---

### Task 5: Editor wiring — crop the selected image

**Files:**
- Modify: `src/components/editor/Editor.tsx`

**Interfaces:**
- Consumes: `CropDialog` (Task 2), the `parchment:crop-image` event (Task 4).
- Produces: `onCropImage` callback passed to `Toolbar` (Task 6).

- [ ] **Step 1: Add imports** — `src/components/editor/Editor.tsx`

```ts
import { NodeSelection } from '@tiptap/pm/state'
import { CropDialog } from '@/components/editor/CropDialog'
```

- [ ] **Step 2: Add crop state + handlers** (inside `Editor`, after the image-dialog state block, ~line 59)

```ts
  // B5 crop: selected-image crop dialog state (pos + attrs captured at open time)
  const [cropState, setCropState] = useState<
    null | { src: string; alt: string; pos: number; attrs: Record<string, unknown> }
  >(null)
```

- [ ] **Step 3: Add the open + apply callbacks** (after `editor` is defined, ~line 141)

```ts
  const openCropForSelection = useCallback(() => {
    if (!editor) return
    const sel = editor.state.selection
    const node = sel instanceof NodeSelection ? sel.node : null
    if (!node || node.type.name !== 'image') return
    const src = node.attrs.src as string | null
    if (!src) return
    setCropState({ src, alt: (node.attrs.alt as string | null) ?? '', pos: sel.from, attrs: node.attrs })
  }, [editor])

  const applyCrop = useCallback(
    (url: string) => {
      if (!editor || !cropState) return
      const { pos, attrs } = cropState
      editor.commands.command(({ tr, dispatch }) => {
        if (dispatch) {
          tr.setNodeMarkup(pos, undefined, { ...attrs, src: url, width: null, height: null })
        }
        return true
      })
      setCropState(null)
    },
    [editor, cropState],
  )

  // Overlay crop button (image NodeView) dispatches this DOM event.
  useEffect(() => {
    if (!editor) return
    const dom = editor.view.dom
    const handler = () => openCropForSelection()
    dom.addEventListener('parchment:crop-image', handler)
    return () => dom.removeEventListener('parchment:crop-image', handler)
  }, [editor, openCropForSelection])
```

(Add `useEffect` to the existing `react` import.)

- [ ] **Step 4: Pass `onCropImage` to Toolbar** — change the Toolbar render (~line 146)

```tsx
      {editor && (
        <Toolbar
          editor={editor}
          docId={docId}
          onInsertImage={openImageDialog}
          onCropImage={openCropForSelection}
        />
      )}
```

- [ ] **Step 5: Render the crop dialog** — after the image-dialog render block (~line 182)

```tsx
      {editor && cropState && (
        <CropDialog
          docId={docId}
          src={cropState.src}
          alt={cropState.alt}
          onCropped={applyCrop}
          onClose={() => setCropState(null)}
        />
      )}
```

- [ ] **Step 6: Typecheck**

Run: `corepack pnpm typecheck`
Expected: FAIL on `Toolbar` (missing `onCropImage` prop) — resolved in Task 6. Proceed.

- [ ] **Step 7: Commit**

```bash
git add src/components/editor/Editor.tsx
git commit -m "feat(B5): editor wiring to crop selected image"
```

---

### Task 6: Toolbar crop button (gated on image selection)

**Files:**
- Modify: `src/components/editor/Toolbar.tsx`

**Interfaces:**
- Consumes: `onCropImage: () => void` from Editor (Task 5).

- [ ] **Step 1: Read the file** to confirm whether `useEditorState` is already imported and how the insert-image button is structured (~line 534). Add `useEditorState` import from `@tiptap/react` if absent.

- [ ] **Step 2: Add the prop** to `Props`:

```ts
  onCropImage: () => void
```

and destructure it in the component signature: `{ editor, docId: _docId, onInsertImage, onCropImage }`.

- [ ] **Step 3: Derive selection state.** If the component already calls `useEditorState`, add `imageSelected: editor.isActive('image')` to its selector and read `s.imageSelected`. Otherwise add:

```ts
  const imageSelected = useEditorState({
    editor,
    selector: ({ editor }) => editor.isActive('image'),
  })
```

- [ ] **Step 4: Add the Crop button** immediately after the insert-image button (after ~line 542):

```tsx
      <button
        type="button"
        aria-label="Crop image"
        className="parchment-toolbar-btn"
        disabled={!imageSelected}
        onClick={() => onCropImage()}
      >
        Crop
      </button>
```

(Match the existing button's `className` — use whatever the insert-image button uses; `parchment-toolbar-btn` is a placeholder to reconcile against the real class when reading the file.)

- [ ] **Step 5: Typecheck**

Run: `corepack pnpm typecheck`
Expected: PASS (Task 5 prop now satisfied).

- [ ] **Step 6: Commit**

```bash
git add src/components/editor/Toolbar.tsx
git commit -m "feat(B5): toolbar crop button gated on image selection"
```

---

### Task 7: Crop inside the insert dialog

**Files:**
- Modify: `src/components/editor/ImageDialog.tsx`

**Interfaces:**
- Consumes: `CropDialog` (Task 2).

- [ ] **Step 1: Import CropDialog + hooks** — `src/components/editor/ImageDialog.tsx`

```ts
import { CropDialog } from '@/components/editor/CropDialog'
```

(`useRef` is already imported.)

- [ ] **Step 2: Add crop state** (after the existing `useState` block):

```ts
  const [cropOpen, setCropOpen] = useState(false)
  const [cropSrc, setCropSrc] = useState('')
  const [cropSourceType, setCropSourceType] = useState<string | undefined>(undefined)
  const [croppedUrl, setCroppedUrl] = useState<string | null>(null)
  const objectUrlRef = useRef<string | null>(null)
```

- [ ] **Step 3: Add open/handle/cleanup logic** (after `doInsert`):

```ts
  const openCrop = useCallback(() => {
    setUploadError('')
    if (tab === 'file' && !prefillSrc) {
      const file = fileRef.current?.files?.[0]
      if (!file) {
        setUploadError('Select a file to crop first.')
        return
      }
      const obj = URL.createObjectURL(file)
      objectUrlRef.current = obj
      setCropSrc(obj)
      setCropSourceType(file.type)
    } else {
      if (!url.trim()) {
        setUploadError('Enter an image URL to crop first.')
        return
      }
      setCropSrc(url.trim())
      setCropSourceType(undefined)
    }
    setCropOpen(true)
  }, [tab, prefillSrc, url])

  const handleCropped = useCallback((cropUrl: string) => {
    setCroppedUrl(cropUrl)
    setCropOpen(false)
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
  }, [])

  // Revoke any pending object URL on unmount.
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    }
  }, [])
```

- [ ] **Step 4: Short-circuit submit when a crop exists.** At the very top of both `handleUrlSubmit` and `handleFileSubmit` (after `e.preventDefault()`):

```ts
      if (croppedUrl) {
        if (!validate()) return
        doInsert(croppedUrl)
        return
      }
```

- [ ] **Step 5: Add the Crop button + cropped indicator.** In BOTH the file form and the url form, inside `parchment-dialog-actions`, before the primary submit button:

```tsx
              <button type="button" className="parchment-dialog-btn-secondary" onClick={openCrop}>
                {croppedUrl ? 'Re-crop' : 'Crop'}
              </button>
```

And above the actions (once, after the `uploadError` block, ~line 239):

```tsx
        {croppedUrl && (
          <p className="parchment-dialog-label">Using cropped image.</p>
        )}
```

- [ ] **Step 6: Render the nested CropDialog** — before the final closing `</div>` of the dialog (replacing the old `TODO(B5)` comment):

```tsx
        {cropOpen && (
          <CropDialog
            docId={docId}
            src={cropSrc}
            alt={alt}
            sourceType={cropSourceType}
            onCropped={handleCropped}
            onClose={() => setCropOpen(false)}
          />
        )}
```

- [ ] **Step 7: Remove the `TODO(B5): full crop` comment block** (lines ~297-299).

- [ ] **Step 8: Typecheck + lint**

Run: `corepack pnpm typecheck && corepack pnpm lint`
Expected: PASS. (`useEffect` must be in the `react` import.)

- [ ] **Step 9: Commit**

```bash
git add src/components/editor/ImageDialog.tsx
git commit -m "feat(B5): crop step in the insert dialog"
```

---

### Task 8: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Lint + typecheck**

Run: `corepack pnpm lint && corepack pnpm typecheck`
Expected: PASS, no diagnostics.

- [ ] **Step 2: Unit tests**

Run: `corepack pnpm vitest run tests/unit`
Expected: PASS — previous 99 + new crop tests.

- [ ] **Step 3: Production build**

Run: `corepack pnpm build`
Expected: build completes, no type/lint errors.

- [ ] **Step 4: Browser check** (preview tools)

Start the dev server, open a doc, insert an image, select it, click Crop (toolbar + overlay), set a rectangle, Apply, and confirm: the image `src` swaps to `/api/docs/<id>/assets/<uuid>.<ext>`, alt is unchanged, autosave fires. Capture a screenshot.

- [ ] **Step 5: Final commit** (if browser check required tweaks; otherwise skip).

---

## Self-Review

**Spec coverage:**
- Canvas-based crop UI → Tasks 2, 3. ✓
- Crop rectangle set by user → Task 2 (pointer drag) + Task 1 (math). ✓
- canvas → blob → upload via existing assets route → Task 2 `apply`. ✓
- Replace src with cropped URL, keep alt → Task 5 `applyCrop` (`setNodeMarkup` spreads attrs incl. alt). ✓
- Three entry points → toolbar (Task 6), overlay (Tasks 4–5), insert dialog (Task 7). ✓
- Preserve format + selector → Task 1 `pickDefaultFormat`, Task 2 selector. ✓
- Unit test for pure crop math → Task 1. ✓
- Verify typecheck/vitest/build/browser → Task 8. ✓
- Accessible dialog, CSS vars, Biome/TS6 → Global Constraints, enforced in Task 8. ✓

**Placeholder scan:** One known reconciliation — the toolbar button `className` in Task 6 Step 4 is marked to match the real insert-image button class when the file is read (the file wasn't fully read at plan time). No other placeholders.

**Type consistency:** `CropFormat`, `Rect`, `Corner`, `SourceRect` names match across `crop.ts` (Task 1), `CropDialog` (Task 2). `onCropImage` consistent between Editor (Task 5) and Toolbar (Task 6). `onCropped`/`onClose`/`sourceType` prop names consistent between `CropDialog` and all three callers.
