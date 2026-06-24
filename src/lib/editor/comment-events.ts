// F3: the DOM-event bridge for the toolbar "Add comment" button.
//
// The D1 comment-create flow lives ENTIRELY inside CommentsSidebar
// (handleAddComment reads the live editor selection and POSTs to the comments
// API, then applies the comment mark). The toolbar button must not duplicate any
// of that — it reuses the SAME path by:
//   1. opening the comments sidebar (existing onToggleComments wiring), and
//   2. dispatching this event on the editor DOM so the sidebar opens its
//      composer focused on the current selection.
//
// Mirrors the existing `parchment:focus-comment` bridge (comment.ts → sidebar)
// so there is one consistent mechanism, not a parallel comment system.
export const OPEN_COMMENT_COMPOSER_EVENT = 'parchment:open-comment-composer'
