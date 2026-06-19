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
