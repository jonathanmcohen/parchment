/**
 * J2 + J3 — Embed (read-only calendar / spreadsheet): block atom node + commands.
 *
 * EMBED BOUNDARY: NO iframe code, NO React, and crucially NO `embed-providers`
 * resolution logic runs at module load here. The NodeView (EmbedView.tsx) is
 * lazy-required inside addNodeView and is the ONLY place an iframe is created —
 * and it does so ONLY when resolveProvider(url) returns an allowlisted https
 * provider URL (else a link-card fallback). This keeps getSchema(baseExtensions)
 * buildable in the Next.js server runtime (the collab seed + parse/serialize
 * path) without dragging any client-only code onto the schema path — the same
 * boundary the diagram nodes (drawio.ts / mermaid.ts) hold.
 *
 * The node stores ONLY plain string attrs { provider, url, title }. The
 * allowlist decision is re-made at render time from `url`, so a stored url that
 * is later removed from the allowlist simply renders as a link card — the node
 * itself never carries a derived iframe src.
 *
 * Round-trip: an embed node serializes as a ```parchment:embed fence carrying
 * { provider, url, title } (see serialize.ts / parse.ts).
 */

import { Node } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'

// ── Module augmentation ────────────────────────────────────────────────────

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    embed: {
      /**
       * Insert an embed node. PURE insert — the slash handler opens the dialog
       * AFTER .run() (inside the chain, view.state is pre-insertion, so the new
       * node's position cannot be resolved here — the G5 lesson). Defaults to an
       * empty url so the inserted node shows a "click to configure" placeholder
       * until the dialog supplies a url.
       */
      insertEmbed: (attrs?: { provider?: string; url?: string; title?: string }) => ReturnType
      /** Update the embed node at `pos` with new provider/url/title. */
      updateEmbed: (pos: number, provider: string, url: string, title: string) => ReturnType
    }
  }
}

// ── EmbedExtension ───────────────────────────────────────────────────────────

export const EmbedExtension = Node.create({
  name: 'embed',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      provider: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-embed-provider') ?? '',
        renderHTML: (attrs) => ({
          'data-embed-provider': typeof attrs.provider === 'string' ? attrs.provider : '',
        }),
      },
      url: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-embed-url') ?? '',
        renderHTML: (attrs) => ({
          'data-embed-url': typeof attrs.url === 'string' ? attrs.url : '',
        }),
      },
      title: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-embed-title') ?? '',
        renderHTML: (attrs) => ({
          'data-embed-title': typeof attrs.title === 'string' ? attrs.title : '',
        }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-embed]' }]
  },

  renderHTML({ HTMLAttributes }) {
    // Keep renderHTML minimal — round-trip goes through serialize/parse, not
    // HTML. NEVER emit an <iframe> here: renderHTML runs on the schema/SSR path
    // and must not produce an unvalidated iframe src. The attrs object carries
    // data-embed-* from renderHTML above.
    return ['div', { 'data-embed': '', ...HTMLAttributes }]
  },

  addNodeView() {
    // Lazy-require EmbedView inside a try/catch so it is never evaluated in the
    // server runtime or in test environments where the @/ alias resolver or JSX
    // transform is unavailable. The schema build, serialize, and parse paths
    // never invoke the NodeView — they only need the schema definition. In the
    // real browser (Next.js client bundle) the alias resolves correctly.
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { EmbedView } = require('@/components/editor/EmbedView') as {
        EmbedView: Parameters<typeof ReactNodeViewRenderer>[0]
      }
      return ReactNodeViewRenderer(EmbedView)
    } catch {
      // Server runtime / test env: no NodeView (falls back to renderHTML).
      return undefined as never
    }
  },

  addCommands() {
    return {
      insertEmbed:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: {
              provider: attrs?.provider ?? '',
              url: attrs?.url ?? '',
              title: attrs?.title ?? '',
            },
          }),
      updateEmbed:
        (pos, provider, url, title) =>
        ({ tr, dispatch, state }) => {
          const target = state.doc.nodeAt(pos)
          // biome-ignore lint/complexity/useOptionalChain: explicit null check needed — nodeAt returns null (not undefined) and the optional chain would change the falsy guard to include undefined
          if (!target || target.type.name !== 'embed') return false
          if (dispatch) {
            tr.setNodeMarkup(pos, undefined, { ...target.attrs, provider, url, title })
            dispatch(tr)
          }
          return true
        },
    }
  },
})
