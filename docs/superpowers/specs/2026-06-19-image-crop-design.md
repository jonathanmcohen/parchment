# Image Crop — Design

**Date:** 2026-06-19
**Branch:** `feat/B5-crop` → PR into `release/v0.1.0`
**Replaces:** the `// TODO(B5): full crop` stub in `src/components/editor/ImageDialog.tsx`

## Goal

Ship a real, canvas-based image crop for the Parchment editor. The user sets a crop
rectangle over an image, applies it, and the editor produces a new cropped asset
(canvas → blob), uploads it via the existing `POST /api/docs/[id]/assets` route, and
swaps the image's `src` for the cropped asset URL. Alt text is preserved.

## Scope

In scope:

- A reusable `CropDialog` React component (accessible modal) with a canvas-based crop UI.
- Three entry points into crop (all share `CropDialog`):
  1. **Toolbar "Crop" button**, enabled only when an image node is selected.
  2. **Overlay "Crop" button** on the selected image (rendered by the image NodeView,
     appears alongside the resize handles when the image is selected).
  3. **Crop in the insert dialog** (`ImageDialog`): a "Crop" affordance that lets the
     user crop before inserting a new image.
- A pure crop-rect math module `src/lib/editor/crop.ts` (the unit-tested core).
- Output format: **preserve the source image's format by default**, with a format
  selector in the dialog (PNG / JPEG / WebP). Non-rasterizable or animated sources
  (SVG, GIF) default to PNG.
- A unit test for the pure crop-rect math (`tests/unit/crop.test.ts`).

Out of scope (YAGNI for v0.1):

- Rotation, flip, filters, aspect-ratio *presets* (free-form crop only; the existing
  `lockAspect` attribute governs *display* resize, not the crop rectangle).
- Server-side image processing — all cropping happens client-side via `<canvas>`.
- Re-cropping losslessly from the original (each crop rasterizes the current `src`).

## Architecture

### 1. Pure math — `src/lib/editor/crop.ts`

No DOM. All geometry the dialog needs, as pure functions, so the tricky parts are
unit-tested in the Vitest `node` environment.

```ts
export interface Rect { x: number; y: number; width: number; height: number }
export interface Size { width: number; height: number }
export interface SourceRect { sx: number; sy: number; sw: number; sh: number }
export type Corner = 'nw' | 'ne' | 'sw' | 'se'

// Centered default crop covering `fraction` (default 0.8) of the displayed image.
export function initialCropRect(display: Size, fraction?: number): Rect

// Clamp a rect to stay within [0,0 .. bounds] and respect a minimum size.
export function clampRect(rect: Rect, bounds: Size, minSize?: number): Rect

// Apply a corner-handle drag (dx,dy in display px) to a crop rect; clamps + min size.
// Anchors the opposite corner so dragging past it flips correctly into a valid rect.
export function resizeCropRect(
  rect: Rect, corner: Corner, dx: number, dy: number, bounds: Size, minSize?: number,
): Rect

// Map a display-space crop rect to integer source-pixel coords, clamped to natural size.
export function displayRectToSource(rect: Rect, display: Size, natural: Size): SourceRect
```

`displayRectToSource` is the crux: the dialog shows the image scaled to fit (`display`
size), the user's crop rect is in display pixels, but `drawImage` must sample from the
image's natural-resolution pixels. It scales by `natural/display` per axis, rounds to
integers, and clamps so `sx+sw ≤ natural.width` and `sy+sh ≤ natural.height`.

### 2. Crop dialog — `src/components/editor/CropDialog.tsx`

Self-contained, source-agnostic. Props:

```ts
type Props = {
  docId: string
  src: string         // image to crop (asset URL, remote URL, or object URL)
  alt: string         // preserved; shown read-only for context
  onCropped: (url: string) => void  // called with the new cropped-asset URL
  onClose: () => void
}
```

Responsibilities:

- Load `src` into an `<img>` with `crossOrigin = 'anonymous'` (same-origin assets are
  unaffected; this lets remote CORS-enabled images crop without tainting the canvas).
- Compute a display size that fits a ~440px box; render the image with an
  absolutely-positioned crop-rect overlay (a `<div>` with 4 corner handles and a
  drag-to-move body). Crop-rect state lives in display coordinates, mutated through the
  pure helpers (`resizeCropRect`, `clampRect`) on pointer drags.
- Format selector (`<select>`: PNG / JPEG / WebP), defaulted from the source type.
- **Apply:** translate the display rect to source pixels (`displayRectToSource`), draw
  that region onto an offscreen `<canvas>` sized `sw × sh`
  (`ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)`; for JPEG, paint a white
  background first since JPEG has no alpha), `canvas.toBlob(blob, mimeType)`, wrap the
  blob in a `File`, POST it to `/api/docs/${docId}/assets`, and call `onCropped(url)`.
- Error states (inline, role="alert"): tainted-canvas `SecurityError`, upload failure,
  network error, image-load failure.
- Accessibility: `role="dialog"`, `aria-modal`, labelled title, Escape closes, focus
  moves into the dialog on open, backdrop click closes. Reuses `parchment-dialog-*`
  classes; adds `parchment-crop-*` classes (canvas frame, crop overlay, handles).

The caller owns what "cropped" means:

- **Edit existing image** (entry points 1 & 2): `onCropped(url)` runs a ProseMirror
  command `setNodeMarkup(pos, { ...attrs, src: url, width: null, height: null })` —
  keeping alt/position/lockAspect, resetting width/height because the aspect changed.
- **Insert flow** (entry point 3): `onCropped(url)` replaces the pending insert `src`
  with the cropped URL; the normal insert path then runs with the original alt.

### 3. Wiring

- **`src/lib/editor/extensions/image.ts`** — in the NodeView, render a "Crop" button in
  the selected-image overlay (visible when selected, like the resize handles). On click
  it ensures the node is selected (`setNodeSelection` at `getPos()`) and dispatches a
  `CustomEvent('parchment:crop-image')` on the editor's DOM. This keeps the imperative
  NodeView decoupled from React — no prop drilling into the extension.
- **`src/components/editor/Editor.tsx`** — owns "crop existing image" state. Opens
  `CropDialog` from (a) a `parchment:crop-image` DOM event listener and (b) a callback
  passed to the toolbar. On open it captures the selected image node's `pos` + attrs
  from `editor.state.selection` (a ProseMirror `NodeSelection` of type `image`).
  `onCropped` replaces the node `src`.
- **`src/components/editor/Toolbar.tsx`** — add a "Crop" button next to "Insert image",
  enabled only when an image node is selected (derived via `useEditorState`). Calls the
  Editor's open-crop callback.
- **`src/components/editor/ImageDialog.tsx`** — replace the TODO stub with a "Crop"
  button that opens `CropDialog` for the current pending source (object URL for a
  selected file, or the URL/prefill src). `onCropped` updates the src that insert uses.

### 4. Styling — `src/app/globals.css`

New `parchment-crop-*` rules using existing CSS vars (`--paper`, `--border`,
`--accent-contrast`, `--foreground`, `--muted`, `--background`): the canvas frame, the
crop overlay box (semi-transparent outside-dim via box-shadow), and corner handles
(mirroring `.parchment-image-handle` sizing).

## Data flow (edit-existing happy path)

1. User selects an image → Toolbar "Crop" enables / overlay button shows.
2. Click → Editor captures `{ pos, attrs }`, opens `CropDialog` with `src`, `alt`.
3. User drags the crop rect; pure helpers keep it valid and in-bounds.
4. Apply → `displayRectToSource` → `canvas.drawImage` → `toBlob` → `File` →
   `POST /api/docs/[id]/assets` → `{ url }`.
5. `onCropped(url)` → `setNodeMarkup(pos, { ...attrs, src: url, width: null, height: null })`.
6. NodeView `update()` swaps the `<img>` src; alt unchanged. Autosave persists.

## Error handling

| Case | Handling |
| --- | --- |
| Image fails to load | Inline error; Apply disabled. |
| Cross-origin taint (`toBlob`/`drawImage` throws `SecurityError`) | Inline error: "Can't crop this image (blocked by its server)." |
| `toBlob` returns null | Inline error: "Crop failed — try a different format." |
| Upload non-2xx / network error | Inline error with server message; dialog stays open. |
| SVG / GIF source | Format selector hides "preserve"; defaults to PNG (rasterized). |

## Testing

- **Unit** (`tests/unit/crop.test.ts`, `node` env): `initialCropRect` centering;
  `clampRect` in-bounds + min-size; `resizeCropRect` per corner incl. drag-past-anchor
  flip and min-size floor; `displayRectToSource` scaling, rounding, and edge clamping
  (e.g. 1:1, 2× scale, non-integer ratios, crop flush to the right/bottom edge).
- **Verification**: `pnpm typecheck`, `pnpm vitest run`, `pnpm build`, then a browser
  check of the crop flow (select image → crop → confirm src swaps, alt intact).

## Conventions

TS6 strict; Biome single-quote / no-semicolon / 2-space / width 100; CSS vars only;
accessible dialog matching the existing `ImageDialog` pattern.
