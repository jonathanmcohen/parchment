// Resolve hook: stub the `server-only` / `client-only` guard packages for the
// standalone collab Node process.
//
// collab/server.ts transitively imports modules marked `import 'server-only'`
// (e.g. @/lib/auth/session, @/lib/authz/doc-access, @/lib/disk/mirror). The
// `server-only` package throws unless it is resolved under a React-Server (RSC)
// export condition — which Next sets during its build, but which a raw
// `tsx collab/server.ts` process does not have. The collab server IS a
// server-side process, so the guard is a false positive here.
//
// We can NOT fix this with Node's global `--conditions=react-server`, because
// that also swaps `react` to its RSC build and breaks `@tiptap/react`
// (which the editor extensions pull in). So we intercept ONLY these two
// specifiers and map them to an empty module, leaving every other import —
// including React — resolved normally.
const EMPTY = 'data:text/javascript,export default {}'

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'server-only' || specifier === 'client-only') {
    return { url: EMPTY, shortCircuit: true }
  }
  return nextResolve(specifier, context)
}
