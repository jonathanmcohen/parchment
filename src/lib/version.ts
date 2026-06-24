// Single source of truth for the current application version.
// Bump this in lock-step with package.json when cutting a release.
export const APP_VERSION = '0.1.2'

// F7: static "About" facts. The repository URL is the canonical source/issues
// home (mirrors the ghcr.io/jonathanmcohen/parchment image namespace). The
// repo declares no SPDX license in-tree, so the license line points readers to
// the authoritative LICENSE in the source repository rather than asserting a
// specific identifier here.
export const APP_REPO_URL = 'https://github.com/jonathanmcohen/parchment'
export const APP_LICENSE_URL = `${APP_REPO_URL}/blob/main/LICENSE`
