'use client'

import type { WatermarkConfig } from '@/lib/editor/watermark'
import { watermarkLayerStyle } from '@/lib/editor/watermark'

type Props = {
  config: WatermarkConfig
}

/**
 * G9: Watermark overlay — absolutely positioned, pointer-events:none, behind content.
 * Renders nothing when config.enabled is false.
 * Text watermarks use a single centred (or tiled-via-background) text element.
 * Image watermarks use a background-image (centred or tiled).
 */
export function WatermarkLayer({ config }: Props) {
  if (!config.enabled) return null

  const style = watermarkLayerStyle(config)

  if (config.kind === 'image') {
    return (
      <div
        aria-hidden="true"
        className="parchment-watermark-layer"
        style={style as React.CSSProperties}
      />
    )
  }

  // Text watermark — tile via a repeating grid of spans, or single centred span.
  if (config.tile) {
    // Tiled text: use CSS background trick with a canvas-generated data URI is
    // complex; instead we use a CSS-grid of repeated spans clipped by the parent.
    // The parent is position:absolute/inset:0/overflow:hidden so spans outside
    // the page bounds are clipped naturally.
    const tileStyle: React.CSSProperties = {
      position: 'absolute',
      inset: '0',
      pointerEvents: 'none',
      zIndex: 0,
      overflow: 'hidden',
      opacity: config.opacity,
      display: 'grid',
      gridTemplateColumns: `repeat(auto-fill, ${config.fontSize * 4}px)`,
      gridTemplateRows: `repeat(auto-fill, ${config.fontSize * 2}px)`,
      alignItems: 'center',
      justifyItems: 'center',
      userSelect: 'none',
    }
    const spanStyle: React.CSSProperties = {
      display: 'block',
      transform: `rotate(${config.rotation}deg)`,
      color: config.color,
      fontSize: `${config.fontSize}px`,
      fontWeight: 'bold',
      whiteSpace: 'nowrap',
    }
    // Render enough repeated items to fill the page (the grid auto-fill handles it).
    const items = Array.from({ length: 40 }, (_, i) => (
      // biome-ignore lint/suspicious/noArrayIndexKey: static repeated items, no better key
      <span key={i} style={spanStyle} aria-hidden="true">
        {config.text}
      </span>
    ))
    return (
      <div aria-hidden="true" className="parchment-watermark-layer" style={tileStyle}>
        {items}
      </div>
    )
  }

  // Single centred text watermark
  return (
    <div
      aria-hidden="true"
      className="parchment-watermark-layer"
      style={style as React.CSSProperties}
    >
      <span>{config.text}</span>
    </div>
  )
}
