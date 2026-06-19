import type { Editor } from '@tiptap/core'
import Image from '@tiptap/extension-image'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { NodeSelection } from '@tiptap/pm/state'
import type { NodeView as ProseMirrorNodeView } from '@tiptap/pm/view'

// ── Attribute types ────────────────────────────────────────────────────────

export type ImagePosition = 'inline' | 'wrap-left' | 'wrap-right' | 'break' | 'behind'

export interface ImageAttrs {
  src?: string
  alt?: string
  width?: number | null
  height?: number | null
  position?: ImagePosition
  lockAspect?: boolean
}

// ── Guard ─────────────────────────────────────────────────────────────────

/**
 * Pure guard for image insertion. Returns {ok:true} when both src and alt are
 * present and non-empty. Used by the insertImage command to block a11y-violating
 * inserts (the axe WCAG2 A/AA gate requires alt text on every image).
 */
export function assertImageAttrs(attrs: {
  src?: string
  alt?: string
}): { ok: true } | { ok: false; error: string } {
  if (!attrs.src || attrs.src.trim() === '') {
    return { ok: false, error: 'src is required' }
  }
  if (!attrs.alt || attrs.alt.trim() === '') {
    return { ok: false, error: 'alt text is required for accessibility' }
  }
  return { ok: true }
}

// ── Custom commands type augmentation ─────────────────────────────────────

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    parchmentImage: {
      /**
       * Insert an image node. Blocked (returns false) when alt text is missing
       * or src is missing — enforces the axe WCAG2 A/AA alt-text gate.
       */
      insertImage: (attrs: ImageAttrs) => ReturnType
    }
  }
}

// ── NodeView for resize handles ────────────────────────────────────────────

function buildImageNodeView(
  node: ProseMirrorNode,
  _editor: Editor,
  getPos: boolean | (() => number | undefined),
): ProseMirrorNodeView {
  const wrapper = document.createElement('span')
  wrapper.classList.add('parchment-image-wrapper')
  const pos = node.attrs.position as ImagePosition | null
  if (pos) wrapper.dataset.imagePosition = pos

  const img = document.createElement('img')
  img.src = node.attrs.src as string
  img.alt = node.attrs.alt as string
  if (node.attrs.width) img.style.width = `${node.attrs.width as number}px`
  if (node.attrs.height) img.style.height = `${node.attrs.height as number}px`
  img.dataset.position = pos ?? 'inline'

  // ── Resize handles ──────────────────────────────────────────────────────
  const handles = ['nw', 'ne', 'sw', 'se'] as const
  for (const corner of handles) {
    const handle = document.createElement('span')
    handle.classList.add('parchment-image-handle', `parchment-image-handle--${corner}`)
    handle.dataset.corner = corner
    handle.setAttribute('aria-hidden', 'true')

    let startX = 0
    let startY = 0
    let startW = 0
    let startH = 0
    const lockAspect = node.attrs.lockAspect as boolean

    const onMouseMove = (e: MouseEvent) => {
      e.preventDefault()
      const dx = e.clientX - startX
      const dy = e.clientY - startY
      let newW = Math.max(40, startW + (corner.includes('e') ? dx : -dx))
      let newH = Math.max(30, startH + (corner.includes('s') ? dy : -dy))
      if (lockAspect && startH > 0) {
        // Keep aspect ratio: lock to whichever dimension changed more
        const ratio = startW / startH
        if (Math.abs(dx) >= Math.abs(dy)) {
          newH = Math.round(newW / ratio)
        } else {
          newW = Math.round(newH * ratio)
        }
      }
      img.style.width = `${newW}px`
      img.style.height = `${newH}px`
    }

    const onMouseUp = (e: MouseEvent) => {
      e.preventDefault()
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      // Commit to ProseMirror
      const newW = Number.parseInt(img.style.width, 10) || null
      const newH = Number.parseInt(img.style.height, 10) || null
      if (typeof getPos === 'function') {
        const pos2 = getPos()
        if (pos2 !== undefined) {
          _editor.commands.command(({ tr }) => {
            tr.setNodeMarkup(pos2, undefined, {
              ...node.attrs,
              width: newW,
              height: newH,
            })
            return true
          })
        }
      }
    }

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault()
      startX = e.clientX
      startY = e.clientY
      startW = img.naturalWidth || img.offsetWidth || (node.attrs.width as number | null) || 200
      startH = img.naturalHeight || img.offsetHeight || (node.attrs.height as number | null) || 150
      if (node.attrs.width) startW = node.attrs.width as number
      if (node.attrs.height) startH = node.attrs.height as number
      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
    })

    wrapper.appendChild(handle)
  }

  // ── Overlay crop button (visible when selected) ─────────────────────────
  const cropBtn = document.createElement('button')
  cropBtn.type = 'button'
  cropBtn.className = 'parchment-image-crop-btn'
  cropBtn.textContent = 'Crop'
  cropBtn.setAttribute('aria-label', 'Crop image')
  // Keep the node selected through the click (don't let mousedown blur/reselect).
  cropBtn.addEventListener('mousedown', (e) => {
    e.preventDefault()
    e.stopPropagation()
  })
  cropBtn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (typeof getPos === 'function') {
      const p = getPos()
      if (p !== undefined) {
        _editor.commands.command(({ tr, dispatch }) => {
          if (dispatch) dispatch(tr.setSelection(NodeSelection.create(tr.doc, p)))
          return true
        })
      }
    }
    _editor.view.dom.dispatchEvent(new CustomEvent('parchment:crop-image', { bubbles: true }))
  })
  wrapper.appendChild(cropBtn)

  wrapper.appendChild(img)

  return {
    dom: wrapper,
    contentDOM: null,
    update(updatedNode) {
      if (updatedNode.type.name !== 'image') return false
      img.src = updatedNode.attrs.src as string
      img.alt = updatedNode.attrs.alt as string
      const newPos = updatedNode.attrs.position as ImagePosition | null
      img.dataset.position = newPos ?? 'inline'
      wrapper.dataset.imagePosition = newPos ?? 'inline'
      if (updatedNode.attrs.width) img.style.width = `${updatedNode.attrs.width as number}px`
      else img.style.width = ''
      if (updatedNode.attrs.height) img.style.height = `${updatedNode.attrs.height as number}px`
      else img.style.height = ''
      return true
    },
    selectNode() {
      wrapper.classList.add('parchment-image-selected')
    },
    deselectNode() {
      wrapper.classList.remove('parchment-image-selected')
    },
  }
}

// ── Extension ──────────────────────────────────────────────────────────────

export const imageExtensions = Image.extend({
  name: 'image',

  addAttributes() {
    return {
      src: { default: null },
      alt: {
        default: null,
        parseHTML: (element) => element.getAttribute('alt') ?? null,
        renderHTML: (attributes) => ({ alt: (attributes.alt as string | null) ?? '' }),
      },
      title: { default: null },
      width: {
        default: null,
        parseHTML: (element) => {
          const w = element.style.width || element.getAttribute('width')
          return w ? Number.parseInt(String(w), 10) || null : null
        },
        renderHTML: (attributes) => {
          if (!attributes.width) return {}
          return { style: `width:${attributes.width as number}px` }
        },
      },
      height: {
        default: null,
        parseHTML: (element) => {
          const h = element.style.height || element.getAttribute('height')
          return h ? Number.parseInt(String(h), 10) || null : null
        },
        renderHTML: (attributes) => {
          if (!attributes.height) return {}
          const existing = attributes.width ? `width:${attributes.width as number}px;` : ''
          return { style: `${existing}height:${attributes.height as number}px` }
        },
      },
      position: {
        default: 'inline' as ImagePosition,
        parseHTML: (element) => (element.dataset.position as ImagePosition | undefined) ?? 'inline',
        renderHTML: (attributes) => ({ 'data-position': attributes.position as ImagePosition }),
      },
      lockAspect: {
        default: true,
        parseHTML: (element) => element.dataset.lockAspect !== 'false',
        renderHTML: (attributes) => ({ 'data-lock-aspect': String(attributes.lockAspect) }),
      },
    }
  },

  renderHTML({ HTMLAttributes }) {
    // Merge width+height into style
    const style: string[] = []
    if (HTMLAttributes.width) style.push(`width:${HTMLAttributes.width as number}px`)
    if (HTMLAttributes.height) style.push(`height:${HTMLAttributes.height as number}px`)
    const attrs: Record<string, unknown> = {
      src: HTMLAttributes.src as string,
      alt: (HTMLAttributes.alt as string | null) ?? '',
      'data-position': HTMLAttributes.position as string,
      'data-lock-aspect': String(HTMLAttributes.lockAspect),
    }
    if (style.length > 0) attrs.style = style.join(';')
    return ['img', attrs]
  },

  addCommands() {
    return {
      insertImage:
        (attrs: ImageAttrs) =>
        ({ commands }) => {
          const guard = assertImageAttrs({
            ...(attrs.src !== undefined ? { src: attrs.src } : {}),
            ...(attrs.alt !== undefined ? { alt: attrs.alt } : {}),
          })
          if (!guard.ok) return false
          return commands.insertContent({
            type: 'image',
            attrs: {
              src: attrs.src,
              alt: attrs.alt,
              width: attrs.width ?? null,
              height: attrs.height ?? null,
              position: attrs.position ?? 'inline',
              lockAspect: attrs.lockAspect ?? true,
            },
          })
        },
    }
  },

  addNodeView() {
    return ({ node, editor, getPos }) => buildImageNodeView(node, editor as Editor, getPos)
  },
})
