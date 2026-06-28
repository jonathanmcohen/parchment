'use client'

import { useEffect, useMemo, useState } from 'react'

// J5-3: the wiki-link graph view. Fetches /api/graph and renders nodes + edges
// as an SVG. Layout is a dependency-free RADIAL placement (nodes on a circle) —
// deliberately NOT a d3 force sim, to avoid pulling a layout bundle for what is
// a modest, self-hosted graph. Each node is clickable → navigates to that doc.
//
// J5-3a spike (decided): a radial layout is O(n), deterministic (stable between
// reloads), and bundle-free. A force-directed layout would untangle dense graphs
// better but costs a dep + non-determinism; not worth it at this scale. If a
// workspace grows huge the view stays legible because positions are fixed and
// the SVG scrolls. Revisit only if users ask for clustering.

type GraphNode = { id: string; title: string }
type GraphEdge = { from: string; to: string }
type LinkGraph = { nodes: GraphNode[]; edges: GraphEdge[] }

const WIDTH = 720
const HEIGHT = 520
const NODE_R = 7

interface Placed extends GraphNode {
  x: number
  y: number
}

function layout(nodes: GraphNode[]): Placed[] {
  const cx = WIDTH / 2
  const cy = HEIGHT / 2
  const radius = Math.min(WIDTH, HEIGHT) / 2 - 60
  const n = nodes.length
  if (n === 1) {
    const only = nodes[0]
    return only ? [{ ...only, x: cx, y: cy }] : []
  }
  return nodes.map((node, i) => {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2
    return { ...node, x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) }
  })
}

export function GraphView() {
  const [graph, setGraph] = useState<LinkGraph | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/graph')
      .then((r) => {
        if (!r.ok) throw new Error('graph fetch failed')
        return r.json() as Promise<LinkGraph>
      })
      .then((data) => {
        if (!cancelled) setGraph(data)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const placed = useMemo(() => (graph ? layout(graph.nodes) : []), [graph])
  const byId = useMemo(() => new Map(placed.map((p) => [p.id, p])), [placed])

  if (error) {
    return <p className="text-sm text-[var(--muted)]">Could not load the link graph.</p>
  }
  if (!graph) {
    return <p className="text-sm text-[var(--muted)]">Loading graph…</p>
  }
  if (graph.nodes.length === 0) {
    return (
      <p className="text-sm text-[var(--muted)]" data-graph-empty>
        No documents yet. Create a few and link them with [[wiki]] links.
      </p>
    )
  }

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label="Document link graph"
      data-graph-view
      style={{ width: '100%', height: 'auto', maxHeight: '70vh' }}
    >
      <title>Document link graph</title>
      {/* Edges first so nodes paint on top. */}
      <g data-graph-edges stroke="var(--border)" strokeWidth={1.5}>
        {graph.edges.map((e) => {
          const a = byId.get(e.from)
          const b = byId.get(e.to)
          if (!a || !b) return null
          return <line key={`${e.from}-${e.to}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
        })}
      </g>
      {/* Nodes — each is a clickable link to the doc. */}
      <g data-graph-nodes>
        {placed.map((p) => (
          <a key={p.id} href={`/d/${p.id}`} aria-label={p.title || 'Untitled'}>
            <circle
              cx={p.x}
              cy={p.y}
              r={NODE_R}
              fill="var(--primary)"
              data-graph-node={p.id}
              style={{ cursor: 'pointer' }}
            />
            <text
              x={p.x}
              y={p.y - NODE_R - 4}
              textAnchor="middle"
              fontSize={11}
              fill="var(--foreground)"
              style={{ pointerEvents: 'none' }}
            >
              {(p.title || 'Untitled').slice(0, 24)}
            </text>
          </a>
        ))}
      </g>
    </svg>
  )
}
