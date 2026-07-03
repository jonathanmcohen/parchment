import type { Editor } from '@tiptap/core'
import Image from '@tiptap/extension-image'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { NodeSelection } from '@tiptap/pm/state'
import type { NodeView as ProseMirrorNodeView } from '@tiptap/pm/view'
import { crossRefNumberingKey } from '@/lib/editor/extensions/cross-ref-numbering'

// ── Attribute types ────────────────────────────────────────────────────────

export type ImagePosition = 'inline' | 'wrap-left' | 'wrap-right' | 'break' | 'behind'

// v0.2.10: horizontal alignment, orthogonal to `position` (flow/wrap). The
// selection bubble exposes these three; block images default to `center`.
export type ImageAlign = 'left' | 'center' | 'right'

export interface ImageAttrs {
  src?: string
  alt?: string
  width?: number | null
  height?: number | null
  position?: ImagePosition
  align?: ImageAlign
  lockAspect?: boolean
  caption?: string
  refId?: string
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

/**
 * Returns the position + node of the image the current selection targets — i.e.
 * a NodeSelection whose node is an image — or null. Used by every attr command
 * so they operate on exactly the selected figure and no-op (return false) when
 * no image is selected. Kept pure/exported for unit testing.
 */
export function selectedImage(state: {
  selection: { node?: ProseMirrorNode; from: number }
}): { pos: number; node: ProseMirrorNode } | null {
  const sel = state.selection as { node?: ProseMirrorNode; from: number }
  const node = sel.node
  if (node && node.type.name === 'image') {
    return { pos: sel.from, node }
  }
  return null
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
      /** Set horizontal alignment on the selected image (single transaction). */
      setImageAlign: (align: ImageAlign) => ReturnType
      /**
       * Set alt text on the selected image. Rejected (returns false) when the
       * new alt is empty/whitespace — the a11y gate requires non-empty alt.
       */
      setImageAlt: (alt: string) => ReturnType
      /** Set (or clear) the optional caption on the selected image. */
      setImageCaption: (caption: string) => ReturnType
      /** Set width (px) on the selected image; height is cleared so it stays auto. */
      setImageWidth: (width: number) => ReturnType
    }
  }
}

// ── NodeView for resize handles ────────────────────────────────────────────

function buildImageNodeView(
  node: ProseMirrorNode,
  _editor: Editor,
  getPos: boolean | (() => number | undefined),
): ProseMirrorNodeView {
  // G8a-fix: track the current node in a mutable binding so paintCaption always
  // reads the latest attrs (ProseMirror nodes are immutable — update() receives a
  // new node object; without this the closure reads stale construction-time attrs
  // and refId/caption changes never render).
  let currentNode = node

  const wrapper = document.createElement('span')
  wrapper.classList.add('parchment-image-wrapper')
  const pos = node.attrs.position as ImagePosition | null
  if (pos) wrapper.dataset.imagePosition = pos
  // v0.2.10: horizontal alignment mirrored to the wrapper for the CSS margins.
  wrapper.dataset.imageAlign = (node.attrs.align as ImageAlign | undefined) ?? 'center'
  // v0.2.10: read-only gating. The chrome (handles/crop) is ALWAYS built, but
  // behavior checks the LIVE `_editor.isEditable` at event time and visibility
  // is CSS-gated on `.ProseMirror[contenteditable="false"]`. Never capture the
  // editable state at construction: the mode dropdown flips Editing↔Viewing at
  // runtime WITHOUT rebuilding NodeViews (verified live — a construction-time
  // flag left the image click-selectable with visible handles in Viewing mode,
  // and would symmetrically leave a read-only-mounted doc without handles
  // after switching back to Editing).
  // G8b-fix: set data-ref-id on the NodeView DOM from the start so
  // parchment:goto-ref can find this figure by [data-ref-id="..."].
  const initialRefId = node.attrs.refId as string | undefined
  if (initialRefId) wrapper.dataset.refId = initialRefId

  const img = document.createElement('img')
  img.src = node.attrs.src as string
  img.alt = node.attrs.alt as string
  if (node.attrs.width) img.style.width = `${node.attrs.width as number}px`
  if (node.attrs.height) img.style.height = `${node.attrs.height as number}px`
  img.dataset.position = pos ?? 'inline'

  // v0.2.10: the image box is the positioning context for the resize handles
  // and crop button, so they pin to the IMAGE corners — not the wrapper corners
  // (the caption line under the image would otherwise stretch the hit-area and
  // float the south handles below the caption).
  const imgBox = document.createElement('span')
  imgBox.className = 'parchment-image-box'
  imgBox.appendChild(img)

  // v0.2.10: click-to-select. ProseMirror's native leaf-click NodeSelection is
  // unreliable through this NodeView's DOM (verified live: a center click landed
  // a TextSelection in the adjacent paragraph), so select explicitly on
  // mousedown: focus the view and set a NodeSelection at this node. preventDefault
  // stops the browser starting a text selection (native image drag still works —
  // dragstart is independent of mousedown's default). Resize handles manage
  // their own mousedown (guarded out), and read-only editors keep the default
  // browser behavior (no selection chrome to show).
  wrapper.addEventListener('mousedown', (e) => {
    if (!_editor.isEditable) return
    if ((e.target as HTMLElement).closest('.parchment-image-handle')) return
    if ((e.target as HTMLElement).closest('.parchment-image-crop-btn')) return
    e.preventDefault()
    if (typeof getPos !== 'function') return
    const p = getPos()
    if (p === undefined) return
    _editor.view.focus()
    _editor.commands.command(({ tr, dispatch }) => {
      if (dispatch) dispatch(tr.setSelection(NodeSelection.create(tr.doc, p)))
      return true
    })
  })

  // G8a: caption element shown below the image as "Figure N: <caption>".
  const captionEl = document.createElement('span')
  captionEl.className = 'parchment-image-caption'
  captionEl.contentEditable = 'false'

  const paintCaption = (): void => {
    const refId = _editor.view ? (currentNode.attrs.refId as string | undefined) : undefined
    const numbering = _editor.view ? crossRefNumberingKey.getState(_editor.view.state) : undefined
    const target = refId ? numbering?.get(refId) : undefined
    const n = target?.number
    const caption = currentNode.attrs.caption as string | undefined
    if (n !== undefined || caption) {
      const prefix = n !== undefined ? `Figure ${n}` : 'Figure'
      captionEl.textContent = caption ? `${prefix}: ${caption}` : prefix
      captionEl.style.display = ''
    } else {
      captionEl.textContent = ''
      captionEl.style.display = 'none'
    }
  }
  paintCaption()

  // ── Resize handles (visible in editable mode only — CSS-gated) ──────────
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
    // v0.2.10: read lockAspect at drag START from currentNode (not the
    // construction-time node — the attr may have changed since mount).
    let lockAspect = true

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
      // Commit to ProseMirror. v0.2.10: spread currentNode.attrs (NOT the
      // construction-time node.attrs) so a resize never reverts align /
      // caption / alt edits made after this NodeView mounted.
      const newW = Number.parseInt(img.style.width, 10) || null
      const newH = Number.parseInt(img.style.height, 10) || null
      if (typeof getPos === 'function') {
        const pos2 = getPos()
        if (pos2 !== undefined) {
          _editor.commands.command(({ tr }) => {
            tr.setNodeMarkup(pos2, undefined, {
              ...currentNode.attrs,
              width: newW,
              height: newH,
            })
            return true
          })
        }
      }
    }

    handle.addEventListener('mousedown', (e) => {
      // Live editable check — handles are CSS-hidden in read-only, but guard
      // the behavior too (defense in depth against stray synthetic events).
      if (!_editor.isEditable) return
      e.preventDefault()
      e.stopPropagation()
      startX = e.clientX
      startY = e.clientY
      lockAspect = currentNode.attrs.lockAspect !== false
      // v0.2.10: start from the RENDERED size (offsetWidth) rather than the
      // natural bitmap size — for a large photo naturalWidth would make the
      // first drag jump. A stored width attr still wins (it IS the layout
      // width the user last committed).
      startW =
        img.offsetWidth || img.naturalWidth || (currentNode.attrs.width as number | null) || 200
      startH =
        img.offsetHeight || img.naturalHeight || (currentNode.attrs.height as number | null) || 150
      if (currentNode.attrs.width) startW = currentNode.attrs.width as number
      if (currentNode.attrs.height) startH = currentNode.attrs.height as number
      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
    })

    imgBox.appendChild(handle)
  }

  // ── Overlay crop button (visible when selected; CSS-hidden read-only) ───
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
    if (!_editor.isEditable) return
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
  imgBox.appendChild(cropBtn)

  wrapper.appendChild(imgBox)
  wrapper.appendChild(captionEl)

  return {
    dom: wrapper,
    contentDOM: null,
    update(updatedNode) {
      if (updatedNode.type.name !== 'image') return false
      // G8a-fix: update currentNode BEFORE calling paintCaption so the closure
      // reads the new attrs (refId assigned by appendTransaction, caption edits).
      currentNode = updatedNode
      img.src = updatedNode.attrs.src as string
      img.alt = updatedNode.attrs.alt as string
      const newPos = updatedNode.attrs.position as ImagePosition | null
      img.dataset.position = newPos ?? 'inline'
      wrapper.dataset.imagePosition = newPos ?? 'inline'
      // v0.2.10: keep the alignment mirror in sync so the CSS margins update
      // live when the bubble sets align.
      wrapper.dataset.imageAlign = (updatedNode.attrs.align as ImageAlign | undefined) ?? 'center'
      // G8b-fix: keep data-ref-id on the wrapper DOM so parchment:goto-ref can
      // find the node by [data-ref-id="..."] (renderHTML is not used when a
      // NodeView is active — the NodeView owns the DOM).
      const rid = updatedNode.attrs.refId as string | undefined
      if (rid) {
        wrapper.dataset.refId = rid
      } else {
        delete wrapper.dataset.refId
      }
      if (updatedNode.attrs.width) img.style.width = `${updatedNode.attrs.width as number}px`
      else img.style.width = ''
      if (updatedNode.attrs.height) img.style.height = `${updatedNode.attrs.height as number}px`
      else img.style.height = ''
      // G8a: repaint caption/number — may change if a sibling figure moved
      // (LESSON 2: always repaint on NodeView.update(), not once at render).
      paintCaption()
      return true
    },
    selectNode() {
      wrapper.classList.add('parchment-image-selected')
    },
    deselectNode() {
      wrapper.classList.remove('parchment-image-selected')
    },
    // v0.2.10: make ProseMirror IGNORE mouse events inside this NodeView. The
    // wrapper's mousedown handler above sets the NodeSelection itself; without
    // stopEvent, PM's own mouseUP handling runs afterwards and resolves the
    // click coords to a nearby TEXT position, stomping the NodeSelection
    // (verified live — a real click selected, then immediately deselected).
    // Drag events are left to PM so native block drag-and-drop keeps working.
    stopEvent(event) {
      if (!_editor.isEditable) return false
      return (
        event.type === 'mousedown' ||
        event.type === 'mouseup' ||
        event.type === 'click' ||
        event.type === 'dblclick'
      )
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
      // v0.2.10: horizontal alignment (left|center|right), orthogonal to
      // `position`. Block images default to center; the bubble toolbar sets it.
      align: {
        default: 'center' as ImageAlign,
        parseHTML: (element) => {
          const a = element.dataset.align
          return a === 'left' || a === 'center' || a === 'right' ? a : 'center'
        },
        renderHTML: (attributes) => ({
          'data-align': (attributes.align as ImageAlign) ?? 'center',
        }),
      },
      lockAspect: {
        default: true,
        parseHTML: (element) => element.dataset.lockAspect !== 'false',
        renderHTML: (attributes) => ({ 'data-lock-aspect': String(attributes.lockAspect) }),
      },
      // G8a: stable refId (assigned by crossRefNumbering appendTransaction).
      refId: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-ref-id') ?? '',
        renderHTML: (attributes) => {
          const rid = attributes.refId as string | null
          return rid ? { 'data-ref-id': rid } : {}
        },
      },
      // G8a: optional caption shown as "Figure N: <caption>" under the image.
      caption: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-caption') ?? '',
        renderHTML: (attributes) => {
          const cap = attributes.caption as string | null
          return cap ? { 'data-caption': cap } : {}
        },
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
      'data-align': (HTMLAttributes.align as string) ?? 'center',
      'data-lock-aspect': String(HTMLAttributes.lockAspect),
    }
    if (style.length > 0) attrs.style = style.join(';')
    const rid = HTMLAttributes.refId as string | undefined
    if (rid) attrs['data-ref-id'] = rid
    const cap = HTMLAttributes.caption as string | undefined
    if (cap) attrs['data-caption'] = cap
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
              align: attrs.align ?? 'center',
              lockAspect: attrs.lockAspect ?? true,
              caption: attrs.caption ?? '',
              refId: attrs.refId ?? '',
            },
          })
        },

      // v0.2.10: attr commands for the selection bubble. Each is a SINGLE
      // setNodeMarkup transaction (collab-safe — one Yjs update, one undo step)
      // and no-ops (returns false) when no image is selected.
      setImageAlign:
        (align: ImageAlign) =>
        ({ state, tr, dispatch }) => {
          const target = selectedImage(state)
          if (!target) return false
          if (dispatch) {
            tr.setNodeMarkup(target.pos, undefined, { ...target.node.attrs, align })
            dispatch(tr)
          }
          return true
        },

      setImageAlt:
        (alt: string) =>
        ({ state, tr, dispatch }) => {
          // a11y gate: never allow an empty alt (WCAG2 A/AA — every image needs
          // alt text). Callers should keep the field required in the UI too.
          if (!alt.trim()) return false
          const target = selectedImage(state)
          if (!target) return false
          if (dispatch) {
            tr.setNodeMarkup(target.pos, undefined, { ...target.node.attrs, alt: alt.trim() })
            dispatch(tr)
          }
          return true
        },

      setImageCaption:
        (caption: string) =>
        ({ state, tr, dispatch }) => {
          const target = selectedImage(state)
          if (!target) return false
          if (dispatch) {
            // caption is optional — empty string clears it.
            tr.setNodeMarkup(target.pos, undefined, { ...target.node.attrs, caption })
            dispatch(tr)
          }
          return true
        },

      setImageWidth:
        (width: number) =>
        ({ state, tr, dispatch }) => {
          const target = selectedImage(state)
          if (!target) return false
          if (dispatch) {
            // height cleared → the img keeps its natural aspect (height:auto).
            tr.setNodeMarkup(target.pos, undefined, {
              ...target.node.attrs,
              width,
              height: null,
            })
            dispatch(tr)
          }
          return true
        },
    }
  },

  addNodeView() {
    return ({ node, editor, getPos }) => buildImageNodeView(node, editor as Editor, getPos)
  },
})
