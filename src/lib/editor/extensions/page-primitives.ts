import { Node } from '@tiptap/core'
import type {
  PageNumberFormat,
  PageNumberPosition,
  SectionConfig,
} from '@/lib/editor/page-primitives'

// ── Module augmentation ────────────────────────────────────────────────────

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    pageBreak: {
      /** Insert a manual page break block at the current position. */
      insertPageBreak: () => ReturnType
    }
    sectionBreak: {
      /**
       * Insert a section break block at the current position.
       * The optional attrs override individual section config fields.
       */
      insertSectionBreak: (attrs?: Partial<SectionConfig>) => ReturnType
    }
  }
}

// ── PageBreak node ─────────────────────────────────────────────────────────

/**
 * pageBreak — an atomic block node that forces a page boundary at its
 * position.  Rendered as a styled hr-like divider with an accessible label.
 *
 * HTML output: <div data-page-break></div>
 *
 * On screen, PageCanvas reads the DOM position of pageBreak nodes and merges
 * them into the automatic break list via mergeBreaks().
 */
export const PageBreakExtension = Node.create({
  name: 'pageBreak',

  group: 'block',

  atom: true,

  parseHTML() {
    return [{ tag: 'div[data-page-break]' }]
  },

  renderHTML() {
    // aria-hidden is applied via CSS class; the label is read by the NodeView
    // but not voiced since the outer div carries aria-hidden in PageCanvas.
    return ['div', { 'data-page-break': '', class: 'parchment-page-break-node' }]
  },

  addCommands() {
    return {
      insertPageBreak:
        () =>
        ({ commands }) =>
          commands.insertContent({ type: 'pageBreak' }),
    }
  },
})

// ── SectionBreak node ──────────────────────────────────────────────────────

/**
 * sectionBreak — an atomic block node that starts a new document section.
 * Carries section-level page config (header, footer, page number format/pos).
 *
 * HTML output: <div data-section-break data-header-text="…" …></div>
 *
 * PageCanvas resolves the active section config for each page region by
 * scanning section-break node positions in document order.
 */
export const SectionBreakExtension = Node.create({
  name: 'sectionBreak',

  group: 'block',

  atom: true,

  addAttributes() {
    return {
      headerText: {
        default: '',
        parseHTML: (el) => el.dataset.headerText ?? '',
        renderHTML: (attrs) => ({ 'data-header-text': String(attrs.headerText) }),
      },
      footerText: {
        default: '',
        parseHTML: (el) => el.dataset.footerText ?? '',
        renderHTML: (attrs) => ({ 'data-footer-text': String(attrs.footerText) }),
      },
      pageNumberFormat: {
        default: '1' as PageNumberFormat,
        parseHTML: (el) => (el.dataset.pageNumberFormat as PageNumberFormat) ?? '1',
        renderHTML: (attrs) => ({ 'data-page-number-format': String(attrs.pageNumberFormat) }),
      },
      pageNumberPosition: {
        default: 'center' as PageNumberPosition,
        parseHTML: (el) => (el.dataset.pageNumberPosition as PageNumberPosition) ?? 'center',
        renderHTML: (attrs) => ({
          'data-page-number-position': String(attrs.pageNumberPosition),
        }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-section-break]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      { 'data-section-break': '', class: 'parchment-section-break-node', ...HTMLAttributes },
    ]
  },

  addCommands() {
    return {
      insertSectionBreak:
        (attrs?: Partial<SectionConfig>) =>
        ({ commands }) =>
          commands.insertContent({
            type: 'sectionBreak',
            attrs: {
              headerText: '',
              footerText: '',
              pageNumberFormat: '1' as PageNumberFormat,
              pageNumberPosition: 'center' as PageNumberPosition,
              ...attrs,
            },
          }),
    }
  },
})
