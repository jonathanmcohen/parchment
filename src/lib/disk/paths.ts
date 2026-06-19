// Pure path-building helpers — no fs, no db, no React.
// Used by mirror.ts and tested in tests/unit/disk-paths.test.ts.

const MAX_SEGMENT_LENGTH = 120

/**
 * Make one path segment safe: strip/replace path separators, control chars,
 * leading dots, trailing spaces/dots; collapse whitespace; cap length (~120).
 * Empty result → 'untitled'.
 */
export function sanitizeSegment(name: string): string {
  let s = name
  // Remove path separators
  s = s.replace(/[/\\]/g, '')
  // Remove null bytes and other control chars (0x00–0x1f, 0x7f)
  // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional — stripping control chars
  s = s.replace(/[\x00-\x1f\x7f]/g, '')
  // Collapse runs of whitespace
  s = s.replace(/\s+/g, ' ').trim()
  // Strip leading dots
  s = s.replace(/^\.+/, '')
  // Strip trailing dots and spaces
  s = s.replace(/[\s.]+$/, '')
  // Cap length
  if (s.length > MAX_SEGMENT_LENGTH) {
    s = s.slice(0, MAX_SEGMENT_LENGTH).trimEnd()
  }
  return s.length > 0 ? s : 'untitled'
}

/**
 * Build the relative .md path for a doc from its folder-name chain (root→leaf,
 * already in order) and title. e.g. (['Work','Q1'], 'My Notes') → 'Work/Q1/My Notes.md'.
 * Each folder name + the title is sanitized.
 */
export function docRelPath(folderNames: string[], title: string): string {
  const parts = [...folderNames.map(sanitizeSegment), `${sanitizeSegment(title)}.md`]
  return parts.join('/')
}

/**
 * Given a desired relPath and a set of already-taken relPaths (lowercased for
 * case-insensitive FS safety), return a unique path by inserting ` (2)`, ` (3)`…
 * before `.md` until free. Returns desired unchanged if not taken.
 */
export function disambiguate(desired: string, taken: ReadonlySet<string>): string {
  if (!taken.has(desired.toLowerCase())) return desired

  // Strip the .md suffix, append counter, re-add .md
  const base = desired.endsWith('.md') ? desired.slice(0, -3) : desired
  let counter = 2
  while (true) {
    const candidate = `${base} (${counter}).md`
    if (!taken.has(candidate.toLowerCase())) return candidate
    counter++
  }
}
