'use client'

// G17: Injects the scoped, sanitized custom CSS for a document as a <style> element.
// prepareCustomCss (sanitize→scope) runs at render time so the raw stored value
// is never injected without sanitization.

import { CUSTOM_CSS_SCOPE, prepareCustomCss } from '@/lib/editor/custom-css'

type Props = { css: string }

/**
 * Renders a `<style>` tag whose content is the sanitized + scoped custom CSS.
 * Only rendered when `css` is non-empty. The scope class is `.parchment-custom-scope`;
 * the caller must add that class to the wrapper around the doc content.
 */
export function CustomCssStyle({ css }: Props) {
  if (!css.trim()) return null
  const prepared = prepareCustomCss(css, `.${CUSTOM_CSS_SCOPE}`)
  if (!prepared.trim()) return null
  // biome-ignore lint/security/noDangerouslySetInnerHtml: content is sanitized+scoped by prepareCustomCss — no external URLs, no <script>, no </style> break-out
  return <style dangerouslySetInnerHTML={{ __html: prepared }} />
}
