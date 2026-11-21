import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { clearChatMemory, readChatMemory } from "@/lib/chat/memory";
import type { ChatHistoryResponse } from "@/lib/chat/types";
import { isDemoUser } from "@/lib/demo";

const NO_STORE = { "Cache-Control": "no-store" };

/** GET /api/chat/history — riwayat Kibo untuk akun yang sedang login. */
export async function GET() {
  const user = await getSession();
  if (!user) {
    return NextResponse.json(
      { error: "Silakan masuk dulu." },
      { status: 401, headers: NO_STORE },
    );
  }

  const memoryEnabled = !isDemoUser(user);
  const messages = memoryEnabled ? await readChatMemory(user.id) : [];
  const body: ChatHistoryResponse = { messages, memory: memoryEnabled };

  return NextResponse.json(body, { headers: NO_STORE });
}

/** DELETE /api/chat/history — tombol "Hapus" di widget chat. */
export async function DELETE() {
  const user = await getSession();
  if (!user) {
    return NextResponse.json(
      { error: "Silakan masuk dulu." },
      { status: 401, headers: NO_STORE },
    );
  }

  if (!isDemoUser(user)) await clearChatMemory(user.id);
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
