'use server'

import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/guard'
import { createDocument } from '@/lib/docs/repo'

// Minimal doc creation for B0 — full file manager is Plan E.
export async function newDocument(): Promise<void> {
  const user = await requireUser()
  const { id } = await createDocument(user.id, {})
  redirect(`/d/${id}`)
}
