import { CHAT_MAX_MESSAGE_CHARS, type ChatMessage } from "@/lib/chat/types";
import { getRedisClient } from "@/lib/redis";

/**
 * Ingatan percakapan Kibo per akun.
 *
 * Disimpan di Redis (server-only) supaya tetap ada walau browser di-refresh,
 * logout, atau pindah perangkat — tanpa menambah tabel baru di Supabase.
 *
 * Key   : `mossifier:chat:<user_id>`
 * Nilai : list of JSON `{ role, content }` (paling lama → paling baru)
 * Batas : 40 pesan terakhir, TTL 30 hari (diperbarui tiap kali menulis).
 *
 * Redis opsional: kalau `REDIS_URL` kosong / gagal, fungsi mengembalikan
 * hasil kosong dan chat tetap berjalan tanpa ingatan.
 */

const KEY_PREFIX = "mossifier:chat:";
const MAX_STORED_MESSAGES = 40;
/** Balasan AI boleh lebih panjang dari pesan pengguna, tapi tetap dibatasi. */
const MAX_ASSISTANT_CHARS = 4000;
const MEMORY_TTL_SECONDS = 60 * 60 * 24 * 30;

function memoryKey(userId: string): string {
  return `${KEY_PREFIX}${userId}`;
}

function cleanMessage(value: unknown): ChatMessage | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const row = value as { role?: unknown; content?: unknown };
  if (row.role !== "user" && row.role !== "assistant") return null;
  if (typeof row.content !== "string") return null;

  const limit =
    row.role === "user" ? CHAT_MAX_MESSAGE_CHARS : MAX_ASSISTANT_CHARS;
  const content = row.content.trim().slice(0, limit);
  return content ? { role: row.role, content } : null;
}

/** Riwayat tersimpan (paling lama → paling baru). Kosong kalau Redis mati. */
export async function readChatMemory(userId: string): Promise<ChatMessage[]> {
  try {
    const client = await getRedisClient();
    if (!client) return [];

    const raw = await client.lRange(
      memoryKey(userId),
      -MAX_STORED_MESSAGES,
      -1,
    );

    const messages: ChatMessage[] = [];
    for (const item of raw) {
      try {
        const parsed = cleanMessage(JSON.parse(item));
        if (parsed) messages.push(parsed);
      } catch {
        // entri rusak: lewati, jangan bikin seluruh riwayat gagal.
      }
    }
    return messages;
  } catch (error) {
    console.error(
      "[chat/memory] gagal membaca riwayat:",
      error instanceof Error ? error.message : error,
    );
    return [];
  }
}

/** Tambah satu pasang pesan (user + balasan AI) dan pangkas ke batas. */
export async function appendChatMemory(
  userId: string,
  messages: ChatMessage[],
): Promise<boolean> {
  const clean = messages
    .map(cleanMessage)
    .filter((message): message is ChatMessage => message !== null);
  if (!clean.length) return false;

  try {
    const client = await getRedisClient();
    if (!client) return false;

    const key = memoryKey(userId);
    await client
      .multi()
      .rPush(
        key,
        clean.map((message) => JSON.stringify(message)),
      )
      .lTrim(key, -MAX_STORED_MESSAGES, -1)
      .expire(key, MEMORY_TTL_SECONDS)
      .exec();
    return true;
  } catch (error) {
    console.error(
      "[chat/memory] gagal menyimpan riwayat:",
      error instanceof Error ? error.message : error,
    );
    return false;
  }
}

/** Hapus seluruh ingatan akun (tombol "Hapus" di widget chat). */
export async function clearChatMemory(userId: string): Promise<boolean> {
  try {
    const client = await getRedisClient();
    if (!client) return false;

    await client.del(memoryKey(userId));
    return true;
  } catch (error) {
    console.error(
      "[chat/memory] gagal menghapus riwayat:",
      error instanceof Error ? error.message : error,
    );
    return false;
  }
}
