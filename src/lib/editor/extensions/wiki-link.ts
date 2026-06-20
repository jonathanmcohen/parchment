import { mergeAttributes, Node } from '@tiptap/core'

// ── Module augmentation ────────────────────────────────────────────────────

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    wikiLink: {
      /**
       * Insert a wiki link atom node referencing another document.
       * `targetId` is the document id; `label` is the displayed title.
       */
      insertWikiLink: (attrs: { targetId: string; label: string }) => ReturnType
    }
  }
}

// ── wikiLink — inline atom node ─────────────────────────────────────────────

/**
 * wikiLink — an inline, atomic node representing a `[[doc]]` link to another
 * Parchment document. It is a single atom (NOT editable text) so the link text
 * cannot be partially edited; the user inserts or deletes it whole.
 *
 * Attrs:
 *   targetId — the linked document's id. Drives the href `/d/<targetId>`.
 *              May be '' for a hand-typed `[[Label]]` parsed from markdown that
 *              was never resolved by title (documented GAP — see parse.ts).
 *   label    — the display text; serialized to markdown as `[[label]]`.
 *
 * HTML output: <a data-wiki-link href="/d/<targetId>">[[label]]</a>
 * When targetId is empty the node renders as a non-navigable span so a bare
 * unresolved link is visually distinct and never points at `/d/`.
 */
export const WikiLink = Node.create({
  name: 'wikiLink',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      targetId: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-wiki-target') ?? '',
        renderHTML: (attrs) => ({ 'data-wiki-target': String(attrs.targetId ?? '') }),
      },
      label: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-wiki-label') ?? el.textContent ?? '',
        renderHTML: (attrs) => ({ 'data-wiki-label': String(attrs.label ?? '') }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'a[data-wiki-link]' }, { tag: 'span[data-wiki-link]' }]
  },

  renderHTML({ HTMLAttributes, node }) {
    const targetId = String(node.attrs.targetId ?? '')
    const label = String(node.attrs.label ?? '')
    const text = `[[${label}]]`
    // Resolved links render as a navigable anchor; unresolved ones (no target)
    // render as a styled, non-navigable span so they never point at a bad href.
    if (targetId) {
      return [
        'a',
        mergeAttributes(HTMLAttributes, {
          'data-wiki-link': '',
          href: `/d/${targetId}`,
          class: 'parchment-wiki-link',
        }),
        text,
      ]
    }
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-wiki-link': '',
        class: 'parchment-wiki-link parchment-wiki-link--unresolved',
      }),
      text,
    ]
  },

  renderText({ node }) {
    return `[[${String(node.attrs.label ?? '')}]]`
  },

  addCommands() {
    return {
      insertWikiLink:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    }
  },
})
