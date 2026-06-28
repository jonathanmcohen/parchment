// Client-safe secret mask. Lives in its OWN module (not secret-box.ts, which
// imports `node:crypto` and therefore can't be pulled into a client component).
// secret-box.ts re-exports this, so existing server-side
// `import { SECRET_MASK } from '@/lib/crypto/secret-box'` keeps working, while
// client islands (e.g. the S3 config form) import it from here.
//
// This is the ONE mask used across every UI/API surface — the value the server
// drops on save so the stored secret is never overwritten by the placeholder.

/** The exact 8 bullet characters (U+2022) shown for a stored secret. */
export const SECRET_MASK = '••••••••'
