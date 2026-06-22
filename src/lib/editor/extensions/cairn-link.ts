import { mergeAttributes, Node } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { cairnPageUrl, sanitizeCairnPageId } from '@/lib/integrations/cairn'

/**
 * J1 CAIRN cross-link node — mirrors F6 wikiLink, but targets an EXTERNAL Cairn
 * page rather than another Parchment doc. The link references a Cairn page by a
 * stable `pageId` (preserved in markdown, unlike wiki which resolves by title).
 *
 * OFF-UNLESS-CONFIGURED: cairnPageUrl(pageId) is null when CAIRN_BASE_URL is
 * unset, so an unconfigured Cairn link renders as a NON-NAVIGABLE span (no bad
 * href) — the link still "works" structurally and round-trips, it just isn't
 * clickable until a Cairn endpoint is configured. No external call happens on
 * the render/schema path; cairn.ts only reads process.env.
 *
 * SCHEMA-PATH SAFE: this module imports only @tiptap/core and the light,
 * env-only cairn.ts helper — no React/DOM/@db — so getSchema(baseExtensions)
 * builds in the Next.js server runtime. The hover preview card lives in the
 * client NodeView (CairnLinkView), added via addNodeView elsewhere.
 */

// ── Module augmentation ────────────────────────────────────────────────────

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    cairnLink: {
      /**
       * Insert a cairnLink atom node referencing a Cairn page.
       * `pageId` is the Cairn page id; `label` is the displayed text. The pageId
       * is sanitized (traversal / injection rejected) before it enters the doc.
       */
      insertCairnLink: (attrs: { pageId: string; label: string }) => ReturnType
    }
  }
}

/** Strip brackets from a label so `[[cairn://id|label]]` round-trips (mirrors the F6 wiki-label invariant). */
function sanitizeCairnLabel(label: unknown): string {
  return String(label ?? '').replace(/[[\]|]/g, '')
}

// ── cairnLink — inline atom node ─────────────────────────────────────────────

export const CairnLink = Node.create({
  name: 'cairnLink',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      pageId: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-cairn-page') ?? '',
        renderHTML: (attrs) => ({ 'data-cairn-page': String(attrs.pageId ?? '') }),
      },
      label: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-cairn-label') ?? el.textContent ?? '',
        renderHTML: (attrs) => ({ 'data-cairn-label': String(attrs.label ?? '') }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'a[data-cairn-link]' }, { tag: 'span[data-cairn-link]' }]
  },

  renderHTML({ HTMLAttributes, node }) {
    const pageId = String(node.attrs.pageId ?? '')
    const rawLabel = String(node.attrs.label ?? '')
    const label = rawLabel.length ? rawLabel : pageId
    const text = `[[cairn://${label}]]`
    // cairnPageUrl returns a real URL ONLY when CAIRN_BASE_URL is set AND the
    // pageId is valid; otherwise null. A null href would be a bad link, so we
    // render a non-navigable styled span instead — never an `href` we cannot
    // honor and never a traversal/injection href (cairnPageUrl validates).
    const href = cairnPageUrl(pageId)
    if (href) {
      return [
        'a',
        mergeAttributes(HTMLAttributes, {
          'data-cairn-link': '',
          'data-cairn-page': pageId,
          href,
          rel: 'noopener noreferrer',
          class: 'parchment-cairn-link',
        }),
        text,
      ]
    }
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-cairn-link': '',
        'data-cairn-page': pageId,
        class: 'parchment-cairn-link parchment-cairn-link--unresolved',
      }),
      text,
    ]
  },

  renderText({ node }) {
    const pageId = String(node.attrs.pageId ?? '')
    const label = String(node.attrs.label ?? '')
    return label.length ? `[[cairn://${pageId}|${label}]]` : `[[cairn://${pageId}]]`
  },

  addCommands() {
    return {
      insertCairnLink:
        (attrs) =>
        ({ commands }) => {
          const pageId = sanitizeCairnPageId(attrs.pageId)
          if (pageId === null) return false
          return commands.insertContent({
            type: this.name,
            attrs: { pageId, label: sanitizeCairnLabel(attrs.label) },
          })
        },
    }
  },

  addNodeView() {
    // Lazy-require the client NodeView inside a try/catch (the drawio.ts pattern)
    // so React/DOM and the preview-card fetch code are NEVER evaluated on the
    // server schema path or in test/server environments where the `@/` alias
    // resolver / JSX transform is unavailable. The schema build, serialize, and
    // parse paths never invoke the NodeView — they only need the schema
    // definition (which falls back to renderHTML). In the real browser (Next.js
    // client bundle) the alias resolves and the preview card renders.
    try {
      const { CairnLinkView } = require('@/components/editor/CairnLinkView') as {
        CairnLinkView: Parameters<typeof ReactNodeViewRenderer>[0]
      }
      return ReactNodeViewRenderer(CairnLinkView)
    } catch {
      // Server runtime / test env: no NodeView (falls back to renderHTML).
      return undefined as never
    }
  },
})
