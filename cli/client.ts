// J9: a tiny PAT-authenticated REST client for a Parchment instance. NO server
// imports, NO db — just fetch. Injectable `fetch` so the unit tests run without a
// live server. Every request carries `Authorization: Bearer <pat>`; the J8 scope
// check happens server-side (a docs:read token's 403 on a write surfaces here as a
// thrown error, never a silent success).

export interface ImportResponse {
  id: string
  warnings: string[]
}

export interface DocSummary {
  id: string
  title: string
  [k: string]: unknown
}

export class ParchmentClient {
  private readonly base: string
  private readonly token: string
  private readonly doFetch: typeof fetch

  constructor(baseUrl: string, token: string, fetchImpl?: typeof fetch) {
    this.base = baseUrl.replace(/\/+$/, '')
    this.token = token
    // Bind so the global fetch keeps its receiver (avoids "Illegal invocation").
    this.doFetch = fetchImpl ?? ((...args) => globalThis.fetch(...args))
  }

  private authHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.token}` }
  }

  /** Throw a descriptive error for a non-2xx response (incl. 401/403). */
  private async assertOk(res: Response, what: string): Promise<void> {
    if (res.ok) return
    let detail = ''
    try {
      const body = (await res.json()) as { error?: string }
      detail = body?.error ? `: ${body.error}` : ''
    } catch {
      // ignore — body may not be JSON
    }
    const hint = res.status === 403 ? ' (token missing required scope?)' : ''
    throw new Error(`${what} failed — HTTP ${res.status}${detail}${hint}`)
  }

  /** GET /api/docs → list of the caller's documents (docs:read). */
  async listDocs(): Promise<DocSummary[]> {
    const res = await this.doFetch(`${this.base}/api/docs`, { headers: this.authHeaders() })
    await this.assertOk(res, 'list docs')
    return (await res.json()) as DocSummary[]
  }

  /** GET /api/search?q=… → search results (docs:read). */
  async search(query: string): Promise<unknown> {
    const url = `${this.base}/api/search?q=${encodeURIComponent(query).replace(/%20/g, '+')}`
    const res = await this.doFetch(url, { headers: this.authHeaders() })
    await this.assertOk(res, 'search')
    return res.json()
  }

  /** POST /api/docs/import (multipart) → { id, warnings } (docs:write). */
  async importDoc(filename: string, bytes: Uint8Array): Promise<ImportResponse> {
    const form = new FormData()
    form.append('file', new Blob([bytes as BlobPart]), filename)
    const res = await this.doFetch(`${this.base}/api/docs/import`, {
      method: 'POST',
      headers: this.authHeaders(),
      body: form,
    })
    await this.assertOk(res, 'import')
    return (await res.json()) as ImportResponse
  }

  /** GET /api/backup/export → workspace backup zip bytes (docs:read). */
  async exportBackup(): Promise<Uint8Array> {
    const res = await this.doFetch(`${this.base}/api/backup/export`, {
      headers: this.authHeaders(),
    })
    await this.assertOk(res, 'backup export')
    return new Uint8Array(await res.arrayBuffer())
  }

  /** POST /api/backup/restore (multipart) → { ok } (docs:write). */
  async restoreBackup(bytes: Uint8Array): Promise<unknown> {
    const form = new FormData()
    form.append('file', new Blob([bytes as BlobPart]), 'backup.zip')
    const res = await this.doFetch(`${this.base}/api/backup/restore`, {
      method: 'POST',
      headers: this.authHeaders(),
      body: form,
    })
    await this.assertOk(res, 'backup restore')
    return res.json()
  }
}
