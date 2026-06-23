/**
 * J6 — GitHub PR / issue embed: block atom node + commands.
 *
 * GETSCHEMA BOUNDARY (mirrors embed.ts / drawio.ts / mermaid.ts): NO React, NO
 * fetch, and NO `@/lib/integrations/github` fetch code runs at module load here.
 * The NodeView (GithubEmbedView.tsx) is lazy-required inside addNodeView and is
 * the ONLY place that calls `/api/github/status` — so getSchema(baseExtensions)
 * stays buildable in the Next.js server runtime (the collab seed + parse /
 * serialize path) without dragging client-only code onto the schema path.
 *
 * The node stores ONLY plain string/number attrs { owner, repo, number, kind,
 * title }. The live status (state badge / author) is fetched at RENDER time by
 * the NodeView from `/api/github/status` keyed on the canonical github.com URL
 * rebuilt from owner/repo/number/kind — the node itself never carries a derived
 * fetch host (the SSRF boundary lives in github.ts / the status route).
 *
 * Round-trip: a githubEmbed node serializes as a ```parchment:github fence
 * carrying { owner, repo, number, kind } (see serialize.ts / parse.ts).
 */

import { Node } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'

// ── Module augmentation ────────────────────────────────────────────────────

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    githubEmbed: {
      /**
       * Insert a githubEmbed node. PURE insert — the slash handler opens the URL
       * dialog AFTER .run() (inside the chain, view.state is pre-insertion, so
       * the new node's position cannot be resolved here — the G5 lesson).
       * Defaults to empty owner/repo so the inserted node shows a
       * "click to configure" placeholder until the dialog supplies a ref.
       */
      insertGithubEmbed: (attrs?: {
        owner?: string
        repo?: string
        number?: number
        kind?: 'pr' | 'issue'
        title?: string
      }) => ReturnType
      /** Update the githubEmbed node at `pos` with a new ref. */
      updateGithubEmbed: (
        pos: number,
        owner: string,
        repo: string,
        number: number,
        kind: 'pr' | 'issue',
        title: string,
      ) => ReturnType
    }
  }
}

// ── GithubEmbedExtension ─────────────────────────────────────────────────────

export const GithubEmbedExtension = Node.create({
  name: 'githubEmbed',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      owner: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-gh-owner') ?? '',
        renderHTML: (attrs) => ({
          'data-gh-owner': typeof attrs.owner === 'string' ? attrs.owner : '',
        }),
      },
      repo: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-gh-repo') ?? '',
        renderHTML: (attrs) => ({
          'data-gh-repo': typeof attrs.repo === 'string' ? attrs.repo : '',
        }),
      },
      number: {
        default: 0,
        parseHTML: (el) => {
          const n = Number.parseInt(el.getAttribute('data-gh-number') ?? '', 10)
          return Number.isInteger(n) && n > 0 ? n : 0
        },
        renderHTML: (attrs) => ({
          'data-gh-number': typeof attrs.number === 'number' ? String(attrs.number) : '0',
        }),
      },
      kind: {
        default: 'issue',
        parseHTML: (el) => (el.getAttribute('data-gh-kind') === 'pr' ? 'pr' : 'issue'),
        renderHTML: (attrs) => ({
          'data-gh-kind': attrs.kind === 'pr' ? 'pr' : 'issue',
        }),
      },
      title: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-gh-title') ?? '',
        renderHTML: (attrs) => ({
          'data-gh-title': typeof attrs.title === 'string' ? attrs.title : '',
        }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-github-embed]' }]
  },

  renderHTML({ HTMLAttributes }) {
    // Keep renderHTML minimal — round-trip goes through serialize/parse, not
    // HTML. NEVER emit a fetch / API call here: renderHTML runs on the
    // schema/SSR path. The attrs object carries data-gh-* from renderHTML above.
    return ['div', { 'data-github-embed': '', ...HTMLAttributes }]
  },

  addNodeView() {
    // Lazy-require GithubEmbedView inside a try/catch so it is never evaluated in
    // the server runtime or in test environments where the @/ alias resolver or
    // JSX transform is unavailable. The schema build, serialize, and parse paths
    // never invoke the NodeView — they only need the schema definition. In the
    // real browser (Next.js client bundle) the alias resolves correctly. Same
    // boundary as embed.ts / drawio.ts.
    try {
      const { GithubEmbedView } = require('@/components/editor/GithubEmbedView') as {
        GithubEmbedView: Parameters<typeof ReactNodeViewRenderer>[0]
      }
      return ReactNodeViewRenderer(GithubEmbedView)
    } catch {
      // Server runtime / test env: no NodeView (falls back to renderHTML).
      return undefined as never
    }
  },

  addCommands() {
    return {
      insertGithubEmbed:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: {
              owner: attrs?.owner ?? '',
              repo: attrs?.repo ?? '',
              number: typeof attrs?.number === 'number' ? attrs.number : 0,
              kind: attrs?.kind === 'pr' ? 'pr' : 'issue',
              title: attrs?.title ?? '',
            },
          }),
      updateGithubEmbed:
        (pos, owner, repo, number, kind, title) =>
        ({ tr, dispatch, state }) => {
          const target = state.doc.nodeAt(pos)
          // biome-ignore lint/complexity/useOptionalChain: explicit null check needed — nodeAt returns null (not undefined) and the optional chain would change the falsy guard to include undefined
          if (!target || target.type.name !== 'githubEmbed') return false
          if (dispatch) {
            tr.setNodeMarkup(pos, undefined, {
              ...target.attrs,
              owner,
              repo,
              number,
              kind: kind === 'pr' ? 'pr' : 'issue',
              title,
            })
            dispatch(tr)
          }
          return true
        },
    }
  },
})
