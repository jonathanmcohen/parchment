// Single source of truth for the current application version.
// Bump this in lock-step with package.json when cutting a release.
export const APP_VERSION = '0.1.5'

// F7: static "About" facts. The repository URL is the canonical source/issues
// home (mirrors the ghcr.io/jonathanmcohen/parchment image namespace). The
// repo declares no SPDX license in-tree, so the license line points readers to
// the authoritative LICENSE in the source repository rather than asserting a
// specific identifier here.
export const APP_REPO_URL = 'https://github.com/jonathanmcohen/parchment'
export const APP_LICENSE_URL = `${APP_REPO_URL}/blob/main/LICENSE`

// CF2: the git commit the running image was built from. Wired through the build
// pipeline as the `GIT_SHA` build-arg (Dockerfile builder ARG → runner ENV →
// release.yml passes `${{ github.sha }}`). Falls back to 'dev' for local builds
// where the env var is unset. Read at module load — fine for an About fact.
export const BUILD_SHA = process.env.GIT_SHA || 'dev'

// The short (7-char) form for display; full SHAs are 40 chars.
export const BUILD_SHA_SHORT = BUILD_SHA === 'dev' ? 'dev' : BUILD_SHA.slice(0, 7)
