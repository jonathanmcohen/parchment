import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://parchment:parchment@localhost:5432/parchment',
  },
  // pgvector + tsvector are created via SQL in migrations; keep extensions filtered.
  extensionsFilters: ['postgis'],
  verbose: true,
  strict: true,
})
