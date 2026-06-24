// S5-2: a tiny presentational tooltip for icon-only controls.
//
// Headless, no portal, no state machine: it wraps the control (`children`) in an
// inline-flex span and renders a positioned `role="tooltip"` label that fades in
// (after a 300ms CSS delay) on hover OR keyboard focus-within. The tooltip is
// SUPPLEMENTARY — the wrapped control keeps its own `aria-label` as the
// accessible name, so axe still sees a name on every icon-only control. The
// 12px Roboto / --tooltip-bg / 4px-radius styling lives in globals.css
// (.px-tip-wrap / .px-tip), consuming the S1 tokens.
export function Tooltip({
  label,
  children,
  className,
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <span className={className ? `px-tip-wrap ${className}` : 'px-tip-wrap'}>
      {children}
      <span role="tooltip" className="px-tip">
        {label}
      </span>
    </span>
  )
}
