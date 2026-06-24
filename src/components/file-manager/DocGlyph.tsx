// S5-4: the Drive-style blue document glyph that replaces the 📄 emoji on every
// doc row (list / grid / details / all-view). A small inline SVG — a sheet of
// paper with a folded corner and a few text lines — filled with the brand blue
// (--primary). Purely decorative: the row's link/label carries the accessible
// name, so the SVG is aria-hidden.
//
// `size` defaults to the 20px chrome icon size (S4-3 --icon-size); the grid view
// passes a larger size for the card thumbnail.
export function DocGlyph({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 20 20"
      xmlns="http://www.w3.org/2000/svg"
      className={className ? `shrink-0 ${className}` : 'shrink-0'}
    >
      {/* Sheet with a folded top-right corner. */}
      <path
        d="M4.5 2.5h7L16 7v9.5a1 1 0 0 1-1 1H4.5a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1Z"
        fill="var(--primary)"
      />
      {/* Folded corner highlight. */}
      <path d="M11.5 2.5 16 7h-3.5a1 1 0 0 1-1-1V2.5Z" fill="var(--on-primary)" opacity="0.45" />
      {/* Text lines. */}
      <rect x="5.75" y="9" width="6.5" height="1.1" rx="0.55" fill="var(--on-primary)" />
      <rect x="5.75" y="11.4" width="6.5" height="1.1" rx="0.55" fill="var(--on-primary)" />
      <rect x="5.75" y="13.8" width="4.25" height="1.1" rx="0.55" fill="var(--on-primary)" />
    </svg>
  )
}
