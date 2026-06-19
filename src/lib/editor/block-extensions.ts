import TaskItem from '@tiptap/extension-task-item'
import TaskList from '@tiptap/extension-task-list'
import TextAlign from '@tiptap/extension-text-align'
import { FirstLineIndent } from '@/lib/editor/extensions/first-line-indent'

/**
 * Block-level formatting extensions for Plan B3.
 * StarterKit already provides: headings, paragraph, blockquote, codeBlock,
 * bulletList, orderedList, listItem, horizontalRule — do NOT re-add them here.
 */
export const blockExtensions = [
  TaskList,
  TaskItem.configure({ nested: true }),
  TextAlign.configure({
    types: ['heading', 'paragraph'],
    alignments: ['left', 'center', 'right', 'justify'],
  }),
  FirstLineIndent,
]
