/**
 * G8a — Cross-reference TARGETS: pure numbering + target collection.
 *
 * IDENTITY MODEL:
 *   refId  = STABLE unique id assigned once, preserved across moves/reorders.
 *            (Do NOT derive from the ordinal.)
 *   number = DYNAMIC, recomputed in document order on every change.
 *
 * This module is pure — no React, no db, no editor-graph. It can be imported
 * in server-side code (serialize/parse tests) and in unit tests without any
 * editor deps.
 */

export type RefKind = 'figure' | 'table' | 'equation' | 'heading'

export interface CrossRefTarget {
  refId: string
  kind: RefKind
  number: number
  label: string
  caption?: string
}

// ── Internal types for plain JSON walk ──────────────────────────────────────

type JsonNode = {
  type?: string
  attrs?: Record<string, unknown>
  content?: JsonNode[]
  text?: string
}

// ProseMirror real-node duck-type
type PMNode = JsonNode & {
  descendants: (cb: (node: PMNode, pos: number) => boolean | undefined) => void
}

function isPMNode(doc: unknown): doc is PMNode {
  return typeof (doc as PMNode).descendants === 'function'
}

// ── collectCrossRefTargets ───────────────────────────────────────────────────

/**
 * Walk a ProseMirror doc (PMNode or plain JSON) and return ordered
 * CrossRefTargets: figures numbered 1,2,…; tables 1,2,…; equations 1,2,…;
 * headings Section 1,2,… (flat ordinal, v0.1). Each counter resets per kind.
 *
 * Headings use their `id` attr as refId (assigned by HeadingId / heading-id.ts).
 * Figures, tables, equations use their `refId` attr.
 */
export function collectCrossRefTargets(doc: unknown): CrossRefTarget[] {
  const targets: CrossRefTarget[] = []
  const counters: Record<RefKind, number> = {
    figure: 0,
    table: 0,
    equation: 0,
    heading: 0,
  }

  if (isPMNode(doc)) {
    ;(doc as PMNode).descendants((node: PMNode) => {
      const t = nodeToTarget(node as JsonNode, counters)
      if (t) targets.push(t)
      return true
    })
    return targets
  }

  // Plain JSON walk (no position tracking needed — just document order)
  const walkJson = (node: JsonNode): void => {
    const t = nodeToTarget(node, counters)
    if (t) targets.push(t)
    for (const child of node.content ?? []) {
      walkJson(child)
    }
  }

  const root = doc as JsonNode
  for (const child of root.content ?? []) {
    walkJson(child)
  }
  return targets
}

function nodeToTarget(node: JsonNode, counters: Record<RefKind, number>): CrossRefTarget | null {
  const type = node.type
  const attrs = node.attrs ?? {}

  if (type === 'image') {
    const refId = typeof attrs.refId === 'string' && attrs.refId ? attrs.refId : ''
    if (!refId) return null
    counters.figure += 1
    const n = counters.figure
    const caption = typeof attrs.caption === 'string' ? attrs.caption : undefined
    return {
      refId,
      kind: 'figure',
      number: n,
      label: `Figure ${n}`,
      ...(caption ? { caption } : {}),
    }
  }

  if (type === 'table') {
    const refId = typeof attrs.refId === 'string' && attrs.refId ? attrs.refId : ''
    if (!refId) return null
    counters.table += 1
    const n = counters.table
    const caption = typeof attrs.caption === 'string' ? attrs.caption : undefined
    return {
      refId,
      kind: 'table',
      number: n,
      label: `Table ${n}`,
      ...(caption ? { caption } : {}),
    }
  }

  if (type === 'mathBlock') {
    const refId = typeof attrs.refId === 'string' && attrs.refId ? attrs.refId : ''
    if (!refId) return null
    counters.equation += 1
    const n = counters.equation
    return { refId, kind: 'equation', number: n, label: `Equation (${n})` }
  }

  if (type === 'heading') {
    const refId = typeof attrs.id === 'string' && attrs.id ? attrs.id : ''
    if (!refId) return null
    counters.heading += 1
    const n = counters.heading
    return { refId, kind: 'heading', number: n, label: `Section ${n}` }
  }

  return null
}

// ── indexTargets ─────────────────────────────────────────────────────────────

/** Map refId → CrossRefTarget for O(1) resolution. */
export function indexTargets(targets: CrossRefTarget[]): Map<string, CrossRefTarget> {
  const map = new Map<string, CrossRefTarget>()
  for (const t of targets) {
    map.set(t.refId, t)
  }
  return map
}
