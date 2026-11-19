import { db } from "@/src/prisma/db";
import type { SessionUser } from "@/lib/auth/types";

export type UserRecord = SessionUser & {
  password: string;
  created_at: Date;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function findUserByEmail(
  email: string,
): Promise<UserRecord | null> {
  const user = await db.orm.public.User.where({
    email: normalizeEmail(email),
  }).first();

  return (user as UserRecord | null) ?? null;
}

export async function createUser(input: {
  email: string;
  password: string;
  name: string;
}): Promise<SessionUser> {
  const user = await db.orm.public.User.create({
    email: normalizeEmail(input.email),
    password: input.password,
    name: input.name.trim() || null,
  });

  return {
    id: user.id,
    email: user.email,
    name: user.name ?? null,
  };
}
