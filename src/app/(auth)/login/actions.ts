'use server'

import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { db, schema } from '@/db'
import { verifyPassword } from '@/lib/auth/password'
import { createSession } from '@/lib/auth/session'

export type LoginState = { error: string } | null

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase()
  const password = String(formData.get('password') ?? '')

  if (!email || !password) return { error: 'Enter your email and password.' }

  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1)

  // Verify against the stored hash. A single generic error for both "no such
  // user" and "wrong password" avoids confirming which emails are registered.
  const ok = user?.passwordHash ? await verifyPassword(user.passwordHash, password) : false

  if (!user || !ok) {
    return { error: 'Invalid email or password.' }
  }

  await db.insert(schema.auditLog).values({
    actorId: user.id,
    action: 'login',
    targetType: 'user',
    targetId: user.id,
  })

  await createSession(user.id)
  redirect('/')
}
