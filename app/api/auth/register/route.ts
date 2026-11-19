import { NextResponse } from "next/server";
import { hashPassword } from "@/lib/auth/password";
import { setSessionCookie } from "@/lib/auth/session";
import { createUser, findUserByEmail } from "@/lib/auth/users";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type RegisterBody = {
  name?: unknown;
  email?: unknown;
  password?: unknown;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as RegisterBody | null;

  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const email =
    typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!name) {
    return NextResponse.json({ error: "Nama wajib diisi." }, { status: 400 });
  }
  if (!EMAIL_PATTERN.test(email)) {
    return NextResponse.json(
      { error: "Format email tidak valid." },
      { status: 400 },
    );
  }
  if (password.length < 6) {
    return NextResponse.json(
      { error: "Password minimal 6 karakter." },
      { status: 400 },
    );
  }

  try {
    const existing = await findUserByEmail(email);
    if (existing) {
      return NextResponse.json(
        { error: "Email sudah terdaftar. Silakan masuk." },
        { status: 409 },
      );
    }

    const user = await createUser({
      email,
      name,
      password: await hashPassword(password),
    });

    await setSessionCookie(user);
    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";

    if (message.includes("users_email_key") || message.includes("unique")) {
      return NextResponse.json(
        { error: "Email sudah terdaftar. Silakan masuk." },
        { status: 409 },
      );
    }

    console.error("[auth/register]", error);
    return NextResponse.json(
      { error: "Gagal membuat akun. Coba lagi." },
      { status: 500 },
    );
  }
}
