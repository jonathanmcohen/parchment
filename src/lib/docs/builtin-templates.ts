// G2: bundled templates. PURE data — no db/React imports — so this module is
// importable from both the server (from-template route, /templates page) and the
// client gallery. `content` is ProseMirror `doc` JSON matching the editor schema
// (doc/paragraph/heading{level}/bulletList/listItem/text — see
// src/lib/editor/tiptap-extensions.ts). The from-template route seeds a fresh
// document directly from this JSON.

/** A ProseMirror document node, minimal but real. */
export interface ProseMirrorDoc {
  type: 'doc'
  content: Record<string, unknown>[]
}

/** J3-2: gallery grouping. Stable, human-readable section labels. */
export type TemplateCategory = 'Work' | 'Writing' | 'Personal'

export interface BuiltinTemplate {
  key: string
  name: string
  description: string
  category: TemplateCategory
  content: ProseMirrorDoc
}

// ─── Node builders (keep the literals below readable + valid) ─────────────────

function text(value: string): Record<string, unknown> {
  return { type: 'text', text: value }
}

function paragraph(value?: string): Record<string, unknown> {
  return value ? { type: 'paragraph', content: [text(value)] } : { type: 'paragraph' }
}

function heading(level: number, value: string): Record<string, unknown> {
  return { type: 'heading', attrs: { level }, content: [text(value)] }
}

function bullets(...items: string[]): Record<string, unknown> {
  return {
    type: 'bulletList',
    content: items.map((item) => ({
      type: 'listItem',
      content: [paragraph(item)],
    })),
  }
}

// ─── The bundled gallery ──────────────────────────────────────────────────────

export const BUILTIN_TEMPLATES: readonly BuiltinTemplate[] = [
  {
    key: 'blank',
    name: 'Blank document',
    description: 'An empty page to start writing from scratch.',
    category: 'Writing',
    content: { type: 'doc', content: [paragraph()] },
  },
  {
    key: 'meeting-notes',
    name: 'Meeting notes',
    description: 'Agenda, attendees, discussion, and action items.',
    category: 'Work',
    content: {
      type: 'doc',
      content: [
        heading(1, 'Meeting notes'),
        paragraph('Date: '),
        heading(2, 'Attendees'),
        bullets('Name', 'Name'),
        heading(2, 'Agenda'),
        bullets('Topic one', 'Topic two'),
        heading(2, 'Discussion'),
        paragraph('Notes from the discussion go here.'),
        heading(2, 'Action items'),
        bullets('Owner — task', 'Owner — task'),
      ],
    },
  },
  {
    key: 'letter',
    name: 'Formal letter',
    description: 'A dated letter with recipient, body, and signature.',
    category: 'Personal',
    content: {
      type: 'doc',
      content: [
        paragraph('Date'),
        paragraph(),
        paragraph('Dear Recipient,'),
        paragraph(),
        paragraph('Write the body of your letter here.'),
        paragraph(),
        paragraph('Sincerely,'),
        paragraph('Your name'),
      ],
    },
  },
  {
    key: 'weekly-report',
    name: 'Weekly report',
    description: 'Highlights, progress, blockers, and next steps.',
    category: 'Work',
    content: {
      type: 'doc',
      content: [
        heading(1, 'Weekly report'),
        paragraph('Week of: '),
        heading(2, 'Highlights'),
        bullets('Highlight one', 'Highlight two'),
        heading(2, 'Progress'),
        bullets('What got done'),
        heading(2, 'Blockers'),
        bullets('Anything in the way'),
        heading(2, 'Next week'),
        bullets('Planned work'),
      ],
    },
  },
  {
    key: 'project-brief',
    name: 'Project brief',
    description: 'Overview, goals, scope, and timeline for a new project.',
    category: 'Work',
    content: {
      type: 'doc',
      content: [
        heading(1, 'Project brief'),
        heading(2, 'Overview'),
        paragraph('A short summary of the project.'),
        heading(2, 'Goals'),
        bullets('Goal one', 'Goal two'),
        heading(2, 'Scope'),
        paragraph('What is in and out of scope.'),
        heading(2, 'Timeline'),
        bullets('Milestone — date'),
      ],
    },
  },
  {
    key: 'prd',
    name: 'Product requirements (PRD)',
    description: 'Problem, goals, requirements, and success metrics for a feature.',
    category: 'Work',
    content: {
      type: 'doc',
      content: [
        heading(1, 'Product requirements'),
        heading(2, 'Problem'),
        paragraph('What problem are we solving, and for whom?'),
        heading(2, 'Goals & non-goals'),
        bullets('Goal: …', 'Non-goal: …'),
        heading(2, 'Requirements'),
        bullets('Must: …', 'Should: …', 'Could: …'),
        heading(2, 'Success metrics'),
        bullets('Metric — target'),
        heading(2, 'Open questions'),
        bullets('Question one'),
      ],
    },
  },
  {
    key: 'weekly-review',
    name: 'Weekly review',
    description: 'A personal retrospective: wins, lessons, and next-week focus.',
    category: 'Personal',
    content: {
      type: 'doc',
      content: [
        heading(1, 'Weekly review'),
        paragraph('Week of: '),
        heading(2, 'Wins'),
        bullets('Something that went well'),
        heading(2, 'Lessons'),
        bullets('Something I learned'),
        heading(2, 'Focus for next week'),
        bullets('One thing to prioritize'),
      ],
    },
  },
  {
    key: 'blog-post',
    name: 'Blog post',
    description: 'A title, hook, sections, and a closing call to action.',
    category: 'Writing',
    content: {
      type: 'doc',
      content: [
        heading(1, 'Post title'),
        paragraph('Open with a hook that draws the reader in.'),
        heading(2, 'Section one'),
        paragraph('Develop your first point here.'),
        heading(2, 'Section two'),
        paragraph('Develop your second point here.'),
        heading(2, 'Conclusion'),
        paragraph('Wrap up and end with a call to action.'),
      ],
    },
  },
]

/** Resolve a bundled template by its stable `key`, or undefined if unknown. */
export function getBuiltinTemplate(key: string): BuiltinTemplate | undefined {
  return BUILTIN_TEMPLATES.find((t) => t.key === key)
}
