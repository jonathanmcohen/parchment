// S5-4: the Drive-style folder glyph that replaces the 📁 / 🏠 emoji on folder
// rows and the Root row. A Material Symbols `folder` glyph (the faces are loaded
// by S1-8), grey by default (--muted) and amber (--star) when starred. The
// `home` variant renders the Root row's house glyph. Purely decorative — the
// adjacent label carries the accessible name, so the glyph is aria-hidden.
export function FolderGlyph({
  starred = false,
  home = false,
  size = 20,
  className,
}: {
  starred?: boolean
  home?: boolean
  size?: number
  className?: string
}) {
  return (
    <span
      aria-hidden="true"
      className={
        className
          ? `material-symbols-rounded shrink-0 ${className}`
          : 'material-symbols-rounded shrink-0'
      }
      style={{
        fontSize: `${size}px`,
        color: starred ? 'var(--star)' : 'var(--muted)',
        fontVariationSettings: starred ? '"FILL" 1' : '"FILL" 0',
      }}
    >
      {home ? 'home' : 'folder'}
    </span>
  )
}
