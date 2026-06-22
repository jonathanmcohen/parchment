import { Fragment, type ReactNode } from 'react'
import { formatBibliography, formatInText } from '@/lib/citations/format'
import type { CiteStyle, CslEntry } from '@/lib/citations/types'
import { parseCslEntries } from '@/lib/citations/types'
import type { CrossRefTarget } from '@/lib/editor/cross-ref'
import { collectCrossRefTargets, indexTargets } from '@/lib/editor/cross-ref'
import { resolveProvider } from '@/lib/editor/embed-providers'
import { plantumlImageUrl } from '@/lib/editor/plantuml'

// G1: a small, XSS-safe ProseMirror-JSON → React renderer for the PUBLIC share
// viewer. Renders the common StarterKit node/mark set used by the editor as
// plain React elements — text always lands in a text node, never as raw HTML —
// so owner-authored content can never inject script into the unauthenticated
// public page. Unknown nodes degrade to their rendered children (or are skipped)
// rather than throwing; this is a read-only display, not a faithful editor.

type PMMark = { type?: string; attrs?: Record<string, unknown> }
type PMNode = {
  type?: string
  attrs?: Record<string, unknown>
  content?: PMNode[]
  text?: string
  marks?: PMMark[]
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

// Wrap a text string in its marks (innermost-first). Only a safe, fixed set of
// marks render; an `href` is constrained to http(s)/mailto so a `javascript:`
// URL in content can't produce a clickable script link.
function applyMarks(text: string, marks: PMMark[] | undefined, key: number): ReactNode {
  let node: ReactNode = text
  for (const mark of marks ?? []) {
    switch (mark.type) {
      case 'bold':
        node = <strong>{node}</strong>
        break
      case 'italic':
        node = <em>{node}</em>
        break
      case 'strike':
        node = <s>{node}</s>
        break
      case 'underline':
        node = <u>{node}</u>
        break
      case 'code':
        node = <code>{node}</code>
        break
      case 'link': {
        const raw = str(mark.attrs?.href)
        const href = raw && /^(https?:|mailto:)/i.test(raw) ? raw : undefined
        node = href ? (
          <a href={href} rel="nofollow noopener noreferrer" target="_blank">
            {node}
          </a>
        ) : (
          node
        )
        break
      }
      default:
        // Unknown mark — render the content unchanged (no raw HTML).
        break
    }
  }
  return <Fragment key={key}>{node}</Fragment>
}

function renderChildren(nodes: PMNode[] | undefined): ReactNode[] {
  return (nodes ?? []).map((n, i) => renderNode(n, i))
}

function renderNode(node: PMNode, key: number): ReactNode {
  if (node.type === 'text') {
    return applyMarks(node.text ?? '', node.marks, key)
  }

  const children = renderChildren(node.content)

  switch (node.type) {
    case 'paragraph':
      return <p key={key}>{children}</p>
    case 'heading': {
      const level = Number(node.attrs?.level)
      const lvl = level >= 1 && level <= 6 ? level : 1
      const Tag = `h${lvl}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
      return <Tag key={key}>{children}</Tag>
    }
    case 'bulletList':
      return <ul key={key}>{children}</ul>
    case 'orderedList':
      return <ol key={key}>{children}</ol>
    case 'listItem':
      return <li key={key}>{children}</li>
    case 'taskList':
      return (
        <ul key={key} data-type="taskList">
          {children}
        </ul>
      )
    case 'taskItem':
      return (
        <li key={key} data-checked={node.attrs?.checked === true}>
          {children}
        </li>
      )
    case 'blockquote':
      return <blockquote key={key}>{children}</blockquote>
    case 'codeBlock':
      return (
        <pre key={key}>
          <code>{children}</code>
        </pre>
      )
    case 'horizontalRule':
    case 'pageBreak':
      return <hr key={key} />
    // G16: speakerNote — NEVER rendered in the public/reading/share view.
    // Notes are author-only; this null ensures they never leak to readers.
    case 'speakerNote':
      return null
    case 'drawing': {
      // G5: render the stored SVG snapshot as a data-URI <img> (XSS-safe:
      // SVG-in-img cannot execute scripts). Empty svg → a muted placeholder.
      const svg = str(node.attrs?.svg)
      if (!svg) {
        return (
          <p key={key} style={{ color: '#999', fontStyle: 'italic' }}>
            Drawing
          </p>
        )
      }
      return (
        // biome-ignore lint/performance/noImgElement: SVG data-URI cannot use next/image (no src optimization applies to inline data URIs); this is the XSS-safe rendering path for owner-authored SVG
        <img
          key={key}
          src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`}
          alt="Drawing"
          style={{ maxWidth: '100%', display: 'block' }}
        />
      )
    }
    case 'drawio': {
      // G6c: render the stored SVG snapshot as a data-URI <img> (XSS-safe:
      // SVG-in-img cannot execute scripts). Empty svg → a muted placeholder.
      const svg = str(node.attrs?.svg)
      if (!svg) {
        return (
          <p key={key} style={{ color: '#999', fontStyle: 'italic' }}>
            Diagram
          </p>
        )
      }
      return (
        // biome-ignore lint/performance/noImgElement: SVG data-URI cannot use next/image (no src optimization applies to inline data URIs); this is the XSS-safe rendering path for owner-authored SVG
        <img
          key={key}
          src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`}
          alt="Diagram"
          style={{ maxWidth: '100%', display: 'block' }}
        />
      )
    }
    case 'mermaid': {
      // G6a: the share viewer cannot run mermaid (client-only lib). Render the
      // source in a <pre> with a muted label. v0.1 documented choice: mermaid
      // is a client-only renderer; the public read-only viewer is server-rendered
      // and must not import mermaid. A prerendered SVG is not stored in the node
      // (unlike drawing), so the only viable fallback is the source in a code block.
      const src = str(node.attrs?.source)
      return (
        <div key={key} style={{ margin: '1em 0' }}>
          <p
            style={{ color: '#999', fontStyle: 'italic', fontSize: '0.85em', margin: '0 0 0.25em' }}
          >
            Mermaid diagram
          </p>
          <pre
            style={{
              background: '#f5f5f5',
              padding: '0.75em',
              borderRadius: '4px',
              overflow: 'auto',
              fontSize: '0.85em',
            }}
          >
            <code>{src ?? ''}</code>
          </pre>
        </div>
      )
    }
    case 'plantuml': {
      // G6b: render via the configured PlantUML server when enabled; otherwise
      // fall back to the source in a <pre>. The public viewer respects the same
      // NEXT_PUBLIC_PLANTUML_SERVER_URL env gate as the editor.
      const src = str(node.attrs?.source)
      const url = src ? plantumlImageUrl(src) : null
      return url !== null ? (
        // biome-ignore lint/performance/noImgElement: external PlantUML server URL cannot use next/image (dynamic src from user-configured endpoint)
        <img
          key={key}
          src={url}
          alt="PlantUML diagram"
          style={{ maxWidth: '100%', display: 'block' }}
        />
      ) : (
        <div key={key} style={{ margin: '1em 0' }}>
          <p
            style={{ color: '#999', fontStyle: 'italic', fontSize: '0.85em', margin: '0 0 0.25em' }}
          >
            PlantUML diagram
          </p>
          <pre
            style={{
              background: '#f5f5f5',
              padding: '0.75em',
              borderRadius: '4px',
              overflow: 'auto',
              fontSize: '0.85em',
            }}
          >
            <code>{src ?? ''}</code>
          </pre>
        </div>
      )
    }
    case 'embed': {
      // J2/J3: in the UNAUTHENTICATED public viewer we deliberately render an
      // embed as a safe click-to-open link card — NEVER a sandboxed iframe.
      // Mirrors the conservative image treatment below: the public read-only
      // page must not load arbitrary third-party frames into an unauthenticated
      // context. resolveProvider is still applied so only an allowlisted https
      // URL is surfaced as the canonical link; anything else shows the raw url.
      const rawUrl = str(node.attrs?.url) ?? ''
      if (!rawUrl) return null
      const resolved = resolveProvider(rawUrl)
      const href = resolved ? resolved.embedUrl : rawUrl
      // Only ever emit an http(s) href; never data:/javascript:.
      if (!/^https?:/i.test(href)) return null
      const title = str(node.attrs?.title) ?? ''
      const label = title || resolved?.provider.label || 'Embedded content'
      return (
        <p key={key}>
          <a href={href} rel="nofollow noopener noreferrer" target="_blank">
            {`[${label}]`}
          </a>
        </p>
      )
    }
    case 'hardBreak':
      return <br key={key} />
    case 'image': {
      const src = str(node.attrs?.src)
      // Only allow http(s) or app-relative image sources; never data:/javascript:
      // URLs. Rendered as a labelled link rather than an inline <img> — keeps the
      // public read-only viewer dependency-light and avoids loading arbitrary
      // remote image bytes into the unauthenticated page.
      if (!src || !/^(https?:|\/)/i.test(src)) return null
      const alt = str(node.attrs?.alt) ?? 'image'
      return (
        <p key={key}>
          <a href={src} rel="nofollow noopener noreferrer" target="_blank">
            {`[${alt}]`}
          </a>
        </p>
      )
    }
    default:
      // Unknown block (table, section break, toc, etc.) — render its children so
      // text content is never silently dropped; wrap in a Fragment.
      return children.length > 0 ? <Fragment key={key}>{children}</Fragment> : null
  }
}

// ── Cross-reference pre-pass ─────────────────────────────────────────────────

/**
 * G8b: pre-pass over the doc JSON to collect all cross-ref targets and build a
 * refId → CrossRefTarget map. Used by the static share viewer to resolve inline
 * crossRef nodes without running the editor or the numbering PM plugin.
 * Delegates to the pure collectCrossRefTargets + indexTargets from cross-ref.ts.
 */
function buildCrossRefMap(doc: PMNode): Map<string, CrossRefTarget> {
  return indexTargets(collectCrossRefTargets(doc))
}

// ── Citation + bibliography pre-pass ─────────────────────────────────────────

/**
 * G7b: pre-pass over the doc JSON to find the first bibliography node and build
 * a key→inText resolution map. Used by the static share viewer to resolve
 * inline citation nodes without running the editor or the PM plugin.
 */
function buildCiteMap(doc: PMNode): Map<string, string> {
  const map = new Map<string, string>()
  let found = false

  function walk(node: PMNode): void {
    if (found) return
    if (node.type === 'bibliography') {
      found = true
      const refs: CslEntry[] = parseCslEntries(node.attrs?.refs as unknown)
      const style: CiteStyle = (() => {
        const s = node.attrs?.style
        if (s === 'apa' || s === 'mla' || s === 'chicago') return s
        return 'apa'
      })()
      for (const entry of refs) {
        map.set(entry.id, formatInText(entry, style))
      }
      return
    }
    for (const child of node.content ?? []) walk(child)
  }
  walk(doc)
  return map
}

// ── Stateful render (with cite resolution) ───────────────────────────────────

/**
 * Render a node, given a pre-built cite resolution map. Handles citation and
 * bibliography nodes directly; all other nodes are rendered with
 * renderChildrenWithCites so that citation atoms inside paragraphs/headings/
 * list items are never silently dropped regardless of nesting depth.
 */
function renderNodeWithCites(
  node: PMNode,
  key: number,
  citeMap: Map<string, string>,
  crossRefMap: Map<string, CrossRefTarget>,
): ReactNode {
  if (node.type === 'text') {
    return applyMarks(node.text ?? '', node.marks, key)
  }

  // citation inline — resolve via the pre-built map. Always render (even when
  // citeMap is empty) so citation atoms are visible as placeholders rather than
  // silently absent when no bibliography exists or it has zero refs.
  if (node.type === 'citation') {
    const k = str(node.attrs?.citeKey)
    const resolved = k ? citeMap.get(k) : undefined
    const display = resolved ?? (k ? `[missing: ${k}]` : '(?)')
    return (
      <span key={key} className="parchment-citation">
        {display}
      </span>
    )
  }

  // G8b: crossRef inline — resolve via the pre-built target map.
  if (node.type === 'crossRef') {
    const targetId = str(node.attrs?.targetId)
    const format = node.attrs?.format === 'number' ? 'number' : 'full'
    const target = targetId ? crossRefMap.get(targetId) : undefined
    const display = target ? (format === 'number' ? String(target.number) : target.label) : '(?)'
    return (
      <span key={key} className="parchment-cross-ref">
        {display}
      </span>
    )
  }

  // bibliography block — render the formatted reference list. Always renders
  // regardless of whether citeMap is empty (zero-ref bibliography is valid).
  if (node.type === 'bibliography') {
    const refs: CslEntry[] = parseCslEntries(node.attrs?.refs as unknown)
    const style: CiteStyle = (() => {
      const s = node.attrs?.style
      if (s === 'apa' || s === 'mla' || s === 'chicago') return s
      return 'apa'
    })()
    const formatted = formatBibliography(refs, style)
    return (
      <div key={key} className="parchment-bibliography-share">
        <h2>References</h2>
        {refs.length === 0 ? (
          <p style={{ color: '#999', fontStyle: 'italic' }}>No references.</p>
        ) : (
          <ol>
            {formatted.map(({ id, text }) => (
              <li key={id}>{text}</li>
            ))}
          </ol>
        )}
      </div>
    )
  }

  // For all other node types re-use renderNode's layout logic but thread
  // renderNodeWithCites through child rendering so citations/crossRefs at any
  // depth are handled correctly.
  const children = renderChildrenWithCites(node.content, citeMap, crossRefMap)

  switch (node.type) {
    case 'paragraph':
      return <p key={key}>{children}</p>
    case 'heading': {
      const level = Number(node.attrs?.level)
      const lvl = level >= 1 && level <= 6 ? level : 1
      const Tag = `h${lvl}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
      return <Tag key={key}>{children}</Tag>
    }
    case 'bulletList':
      return <ul key={key}>{children}</ul>
    case 'orderedList':
      return <ol key={key}>{children}</ol>
    case 'listItem':
      return <li key={key}>{children}</li>
    case 'taskList':
      return (
        <ul key={key} data-type="taskList">
          {children}
        </ul>
      )
    case 'taskItem':
      return (
        <li key={key} data-checked={node.attrs?.checked === true}>
          {children}
        </li>
      )
    case 'blockquote':
      return <blockquote key={key}>{children}</blockquote>
    case 'codeBlock':
      return (
        <pre key={key}>
          <code>{children}</code>
        </pre>
      )
    // G16: speakerNote — NEVER rendered in the public/reading/share view.
    // Notes are author-only; returning null here ensures they never leak.
    case 'speakerNote':
      return null
    default:
      // Delegate to the cite-unaware renderer for specialised block types
      // (drawing, mermaid, plantuml, etc.) that cannot contain citation nodes.
      return renderNode(node, key)
  }
}

/**
 * Citation+crossRef-aware child renderer: calls renderNodeWithCites for each
 * child so citation/crossRef atoms at any nesting depth are rendered rather
 * than silently dropped.
 */
function renderChildrenWithCites(
  nodes: PMNode[] | undefined,
  citeMap: Map<string, string>,
  crossRefMap: Map<string, CrossRefTarget>,
): ReactNode[] {
  return (nodes ?? []).map((n, i) => renderNodeWithCites(n, i, citeMap, crossRefMap))
}

/** Render a ProseMirror `doc` JSON value to read-only React nodes. Accepts the
 *  raw `contentJson` from the API (unknown); a null/invalid value renders an
 *  empty doc. NEVER throws and NEVER emits raw HTML. */
export function renderReadOnlyDoc(content: unknown): ReactNode {
  if (!content || typeof content !== 'object') {
    return <p className="parchment-share-empty">This document is empty.</p>
  }
  const doc = content as PMNode
  const top = doc.type === 'doc' ? doc.content : undefined

  // G7b: build the cite resolution map from the whole doc before rendering.
  // Always use renderNodeWithCites regardless of whether citeMap is empty: a
  // bibliography with zero refs must still render, and citation nodes must
  // produce their '[missing: key]' placeholder even when no bibliography exists.
  const citeMap = buildCiteMap(doc)

  // G8b: build the cross-reference target map from the whole doc before
  // rendering. crossRef nodes resolve their label via this map (no editor/PM
  // plugin needed in the static share viewer).
  const crossRefMap = buildCrossRefMap(doc)

  const children = (top ?? []).map((n, i) => renderNodeWithCites(n, i, citeMap, crossRefMap))

  if (children.length === 0) {
    return <p className="parchment-share-empty">This document is empty.</p>
  }
  return <>{children}</>
}
