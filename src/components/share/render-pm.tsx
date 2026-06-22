import { Fragment, type ReactNode } from 'react'
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

/** Render a ProseMirror `doc` JSON value to read-only React nodes. Accepts the
 *  raw `contentJson` from the API (unknown); a null/invalid value renders an
 *  empty doc. NEVER throws and NEVER emits raw HTML. */
export function renderReadOnlyDoc(content: unknown): ReactNode {
  if (!content || typeof content !== 'object') {
    return <p className="parchment-share-empty">This document is empty.</p>
  }
  const doc = content as PMNode
  const top = doc.type === 'doc' ? doc.content : undefined
  const children = renderChildren(top)
  if (children.length === 0) {
    return <p className="parchment-share-empty">This document is empty.</p>
  }
  return <>{children}</>
}
