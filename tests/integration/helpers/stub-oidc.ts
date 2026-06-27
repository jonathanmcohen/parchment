// Task 3.4 — a REAL local OIDC stub provider for the SSO integration tests. It
// serves real discovery + JWKS + token endpoints so openid-client runs a full
// discovery → authorize → token-exchange round-trip with NO mocking of the library.
//
// Lives under tests/ (not a product file). Binds to 127.0.0.1 on an OS-assigned
// free port (server.listen(0)). RS256 keypair generated once via jose. The /token
// endpoint consumes a one-time code minted via issueCode() (single-use: deleted on
// exchange). mintIdToken()/tamperToken() build tokens for the rejection tests.
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { type CryptoKey, exportJWK, generateKeyPair, type JWK, SignJWT } from 'jose'

export type IdTokenClaims = {
  sub: string
  email?: string
  email_verified?: boolean
  name?: string
  preferred_username?: string
  // Allow overriding the standard claims for rejection tests.
  iss?: string
  aud?: string
  nonce?: string
  exp?: number
  iat?: number
}

type CodeRecord = { claims: IdTokenClaims; nonce: string | undefined }

export class StubOidcProvider {
  private server: Server | null = null
  private privateKey!: CryptoKey
  private publicJwk!: JWK
  private readonly kid = 'stub-key-1'
  private issuerUrl = ''
  private clientId = 'parchment-test-client'
  private clientSecret = 'test-client-secret'
  // One-time authorization codes → the claims/nonce to mint on exchange.
  private codes = new Map<string, CodeRecord>()

  setClient(clientId: string, clientSecret: string): void {
    this.clientId = clientId
    this.clientSecret = clientSecret
  }

  get issuer(): string {
    return this.issuerUrl
  }

  // Mint a one-time authorization code mapped to the given claims (+ the nonce the
  // RP sent, which the token endpoint echoes into the id_token). Single-use.
  issueCode(claims: IdTokenClaims, nonce?: string): string {
    const code = `code-${Math.random().toString(36).slice(2)}-${Date.now()}`
    this.codes.set(code, { claims, nonce })
    return code
  }

  // Sign + return an id_token directly (for tampered-token / hand-injection tests).
  async mintIdToken(claims: IdTokenClaims): Promise<string> {
    const now = Math.floor(Date.now() / 1000)
    const payload: Record<string, unknown> = {}
    if (claims.email !== undefined) payload.email = claims.email
    if (claims.email_verified !== undefined) payload.email_verified = claims.email_verified
    if (claims.name !== undefined) payload.name = claims.name
    if (claims.preferred_username !== undefined)
      payload.preferred_username = claims.preferred_username
    if (claims.nonce !== undefined) payload.nonce = claims.nonce

    return new SignJWT(payload)
      .setProtectedHeader({ alg: 'RS256', kid: this.kid })
      .setSubject(claims.sub)
      .setIssuer(claims.iss ?? this.issuerUrl)
      .setAudience(claims.aud ?? this.clientId)
      .setIssuedAt(claims.iat ?? now)
      .setExpirationTime(claims.exp ?? now + 300)
      .sign(this.privateKey)
  }

  // Re-serialize a SIGNED token with one payload field replaced — this BREAKS the
  // signature (the library must reject it). Used by the nonce/aud/exp tamper tests
  // that need an invalid signature over a forged claim.
  tamperToken(idToken: string, field: keyof IdTokenClaims, value: unknown): string {
    const [header, payloadB64, sig] = idToken.split('.') as [string, string, string]
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'))
    payload[field] = value
    const forged = Buffer.from(JSON.stringify(payload)).toString('base64url')
    return `${header}.${forged}.${sig}`
  }

  async start(): Promise<{ issuer: string; port: number }> {
    const kp = await generateKeyPair('RS256', { extractable: true })
    this.privateKey = kp.privateKey
    this.publicJwk = { ...(await exportJWK(kp.publicKey)), kid: this.kid, alg: 'RS256', use: 'sig' }

    this.server = createServer((req, res) => {
      void this.handle(req, res)
    })
    await new Promise<void>((resolve) => this.server?.listen(0, '127.0.0.1', resolve))
    const { port } = this.server?.address() as AddressInfo
    this.issuerUrl = `http://127.0.0.1:${port}`
    return { issuer: this.issuerUrl, port }
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve, reject) =>
      this.server ? this.server.close((e) => (e ? reject(e) : resolve())) : resolve(),
    )
    this.server = null
  }

  private async handle(
    req: import('node:http').IncomingMessage,
    res: import('node:http').ServerResponse,
  ): Promise<void> {
    const url = new URL(req.url ?? '/', this.issuerUrl)
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(body))
    }

    if (url.pathname === '/.well-known/openid-configuration') {
      return send(200, {
        issuer: this.issuerUrl,
        authorization_endpoint: `${this.issuerUrl}/authorize`,
        token_endpoint: `${this.issuerUrl}/token`,
        jwks_uri: `${this.issuerUrl}/jwks`,
        response_types_supported: ['code'],
        subject_types_supported: ['public'],
        id_token_signing_alg_values_supported: ['RS256'],
        grant_types_supported: ['authorization_code'],
        scopes_supported: ['openid', 'email', 'profile'],
        token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
        code_challenge_methods_supported: ['S256'],
      })
    }

    if (url.pathname === '/jwks') {
      return send(200, { keys: [this.publicJwk] })
    }

    if (url.pathname === '/token' && req.method === 'POST') {
      const raw = await readBody(req)
      const params = new URLSearchParams(raw)
      // Client auth: accept client_secret_post body OR a Basic header.
      const auth = req.headers.authorization
      let cid = params.get('client_id') ?? ''
      let csecret = params.get('client_secret') ?? ''
      if (auth?.startsWith('Basic ')) {
        const decoded = Buffer.from(auth.slice('Basic '.length), 'base64').toString('utf8')
        const idx = decoded.indexOf(':')
        cid = decodeURIComponent(decoded.slice(0, idx))
        csecret = decodeURIComponent(decoded.slice(idx + 1))
      }
      if (params.get('grant_type') !== 'authorization_code')
        return send(400, { error: 'unsupported_grant_type' })
      if (cid !== this.clientId || csecret !== this.clientSecret)
        return send(401, { error: 'invalid_client' })

      const code = params.get('code') ?? ''
      const record = this.codes.get(code)
      if (!record) return send(400, { error: 'invalid_grant' }) // unknown/replayed code
      this.codes.delete(code) // single-use

      const idToken = await this.mintIdToken({
        ...record.claims,
        ...(record.nonce !== undefined ? { nonce: record.nonce } : {}),
      })
      return send(200, {
        access_token: `at-${Math.random().toString(36).slice(2)}`,
        token_type: 'Bearer',
        id_token: idToken,
        expires_in: 300,
      })
    }

    send(404, { error: 'not_found' })
  }
}

function readBody(req: import('node:http').IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = ''
    req.on('data', (c) => {
      data += c
    })
    req.on('end', () => resolve(data))
  })
}
