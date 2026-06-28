// Registers the server-only/client-only resolve stub (loader-server-only.mjs)
// for the collab Node process. Used via `node --import ./collab/register-loader.mjs`.
// See loader-server-only.mjs for why the collab server needs this.
import { register } from 'node:module'

register('./loader-server-only.mjs', import.meta.url)
