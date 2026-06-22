// Minimal type declaration for pagedjs@0.4.3 (no @types/pagedjs published).
// Only the Previewer class and the preview() method are used by Parchment.

declare module 'pagedjs' {
  interface PreviewFlow {
    pages: unknown[]
    performance: number
    size: unknown
  }

  class Previewer {
    /**
     * Paginate `content` into `renderTo` using `stylesheets`.
     * @param content    - Source DOM node (or null to use page body)
     * @param stylesheets - Array of CSS strings or URLs
     * @param renderTo   - Target DOM node to paginate into
     */
    preview(
      content: HTMLElement | null,
      stylesheets: string[],
      renderTo: HTMLElement,
    ): Promise<PreviewFlow>
  }

  export { Previewer }
}
