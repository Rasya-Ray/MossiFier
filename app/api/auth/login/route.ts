import { NextResponse } from "next/server";
import { verifyPassword } from "@/lib/auth/password";
import { setSessionCookie } from "@/lib/auth/session";
import { findUserByEmail } from "@/lib/auth/users";

type LoginBody = {
  email?: unknown;
  password?: unknown;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as LoginBody | null;

  const email =
    typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email dan password wajib diisi." },
      { status: 400 },
    );
  }

  try {
    const record = await findUserByEmail(email);
    if (!record || !(await verifyPassword(password, record.password))) {
      return NextResponse.json(
        { error: "Email atau password salah." },
        { status: 401 },
      );
    }

    const user = { id: record.id, email: record.email, name: record.name };
    await setSessionCookie(user);
    return NextResponse.json({ user });
  } catch (error) {
    console.error("[auth/login]", error);
    return NextResponse.json(
      { error: "Gagal masuk. Coba lagi." },
      { status: 500 },
    );
  }
}
