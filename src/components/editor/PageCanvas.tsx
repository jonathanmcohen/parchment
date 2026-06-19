'use client'

import { useEffect, useRef, useState } from 'react'
import type { PageSize } from '@/lib/editor/paginate'
import { pageCount as computePageCount, measurePageBreaks, pageDims } from '@/lib/editor/paginate'

type Props = {
  size: PageSize
  children: React.ReactNode
  onPageCountChange?: (n: number) => void
}

export function PageCanvas({ size, children, onPageCountChange }: Props) {
  const { widthPx, heightPx } = pageDims(size)
  const contentRef = useRef<HTMLDivElement>(null)
  const [breaks, setBreaks] = useState<number[]>([])

  useEffect(() => {
    const el = contentRef.current
    if (!el) return

    const update = () => {
      const h = el.scrollHeight
      const newBreaks = measurePageBreaks(h, heightPx)
      setBreaks(newBreaks)
      onPageCountChange?.(computePageCount(h, heightPx))
    }

    update()

    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [heightPx, onPageCountChange])

  return (
    <div style={{ width: widthPx }} className="parchment-page mx-auto">
      {/* Break markers — decorative, aria-hidden */}
      {breaks.map((offset, i) => (
        <div
          key={offset}
          aria-hidden="true"
          style={{ top: offset }}
          className="parchment-page-break"
        >
          <span className="parchment-page-break-label">Page {i + 2}</span>
        </div>
      ))}

      {/* Content wrapper — measured by ResizeObserver */}
      <div ref={contentRef} className="parchment-page-content">
        {children}
      </div>
    </div>
  )
}
