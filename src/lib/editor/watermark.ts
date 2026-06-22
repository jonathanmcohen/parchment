// ── Watermark configuration ────────────────────────────────────────────────

export interface WatermarkConfig {
  enabled: boolean
  kind: 'text' | 'image'
  text: string
  imageUrl: string
  opacity: number
  rotation: number
  tile: boolean
  color: string
  fontSize: number
}

export const DEFAULT_WATERMARK: WatermarkConfig = {
  enabled: false,
  kind: 'text',
  text: 'DRAFT',
  opacity: 0.12,
  rotation: -45,
  tile: false,
  color: '#888888',
  fontSize: 72,
  imageUrl: '',
}

const VALID_KINDS = new Set<string>(['text', 'image'])

/** Validate/normalize an unknown value. Clamps numeric fields; falls back to defaults; never throws. */
export function parseWatermark(raw: unknown): WatermarkConfig {
  if (raw === null || raw === undefined || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...DEFAULT_WATERMARK }
  }

  const obj = raw as Record<string, unknown>

  const enabled = typeof obj.enabled === 'boolean' ? obj.enabled : DEFAULT_WATERMARK.enabled

  const rawKind = obj.kind
  const kind: 'text' | 'image' =
    typeof rawKind === 'string' && VALID_KINDS.has(rawKind)
      ? (rawKind as 'text' | 'image')
      : DEFAULT_WATERMARK.kind

  const text = typeof obj.text === 'string' ? obj.text : DEFAULT_WATERMARK.text

  const imageUrl = typeof obj.imageUrl === 'string' ? obj.imageUrl : DEFAULT_WATERMARK.imageUrl

  const rawOpacity = obj.opacity
  const opacity =
    typeof rawOpacity === 'number' && Number.isFinite(rawOpacity)
      ? Math.min(1, Math.max(0, rawOpacity))
      : DEFAULT_WATERMARK.opacity

  const rawRotation = obj.rotation
  const rotation =
    typeof rawRotation === 'number' && Number.isFinite(rawRotation)
      ? Math.min(180, Math.max(-180, rawRotation))
      : DEFAULT_WATERMARK.rotation

  const tile = typeof obj.tile === 'boolean' ? obj.tile : DEFAULT_WATERMARK.tile

  const color =
    typeof obj.color === 'string' && obj.color.length > 0 ? obj.color : DEFAULT_WATERMARK.color

  const rawFontSize = obj.fontSize
  const fontSize =
    typeof rawFontSize === 'number' && Number.isFinite(rawFontSize)
      ? Math.min(300, Math.max(8, rawFontSize))
      : DEFAULT_WATERMARK.fontSize

  return { enabled, kind, text, imageUrl, opacity, rotation, tile, color, fontSize }
}

/**
 * Returns a style descriptor for the watermark overlay layer.
 * The overlay is absolutely positioned, pointer-events:none, behind content.
 * For tile=true, returns a background-based tile descriptor.
 * For tile=false (single centered), returns a flex-centered descriptor.
 */
export function watermarkLayerStyle(cfg: WatermarkConfig): Record<string, string | number> {
  const base: Record<string, string | number> = {
    position: 'absolute',
    inset: '0',
    pointerEvents: 'none',
    zIndex: '0',
    overflow: 'hidden',
  }

  if (!cfg.enabled) return base

  if (cfg.kind === 'image') {
    if (cfg.tile) {
      return {
        ...base,
        backgroundImage: `url(${cfg.imageUrl})`,
        backgroundRepeat: 'repeat',
        backgroundSize: `${cfg.fontSize * 2}px ${cfg.fontSize * 2}px`,
        opacity: cfg.opacity,
      }
    }
    return {
      ...base,
      backgroundImage: `url(${cfg.imageUrl})`,
      backgroundRepeat: 'no-repeat',
      backgroundPosition: 'center',
      backgroundSize: 'contain',
      opacity: cfg.opacity,
    }
  }

  // Text watermark
  return {
    ...base,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: cfg.opacity,
    transform: `rotate(${cfg.rotation}deg)`,
    color: cfg.color,
    fontSize: `${cfg.fontSize}px`,
    fontWeight: 'bold',
    userSelect: 'none',
    whiteSpace: 'nowrap',
  }
}
