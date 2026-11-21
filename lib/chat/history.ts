import { CHAT_MAX_MESSAGE_CHARS, type ChatMessage } from "@/lib/chat/types";

/**
 * Riwayat chat Kibo per akun (localStorage, key memuat user id).
 * - Akun A dan B punya riwayat sendiri-sendiri, tidak pernah tercampur.
 * - Akun demo TIDAK disimpan (semua juri memakai id yang sama) — lihat chat-widget.
 * Sumber kebenaran percakapan tetap di client; server tidak menyimpan apa pun.
 */

/** Dikirim saat logout agar widget yang tidak boleh menyimpan riwayat (demo) langsung dikosongkan. */
export const CHAT_RESET_EVENT = "mossifier:chat-reset";

const STORAGE_PREFIX = "mossifier.chat";

/** Jumlah pesan terakhir yang disimpan per akun. */
export const CHAT_MAX_STORED = 30;

/** Balasan AI bisa lebih panjang dari pesan user; batasi supaya storage tetap kecil. */
const MAX_STORED_CHARS = 6000;

export function chatStorageKey(userId: string): string {
  return `${STORAGE_PREFIX}.${userId}`;
}

/** Baca & validasi isi storage. Data rusak / bentuk salah → daftar kosong. */
export function parseStoredMessages(raw: string | null): ChatMessage[] {
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];

    const messages: ChatMessage[] = [];
    for (const item of data) {
      if (!item || typeof item !== "object") continue;
      const { role, content } = item as { role?: unknown; content?: unknown };
      if (role !== "user" && role !== "assistant") continue;
      if (typeof content !== "string" || !content.trim()) continue;
      messages.push({
        role,
        content: content.slice(
          0,
          role === "user" ? CHAT_MAX_MESSAGE_CHARS : MAX_STORED_CHARS,
        ),
      });
    }
    return messages.slice(-CHAT_MAX_STORED);
  } catch {
    return [];
  }
}

export function loadChatHistory(userId: string): ChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    return parseStoredMessages(
      window.localStorage.getItem(chatStorageKey(userId)),
    );
  } catch {
    return [];
  }
}

/** Simpan riwayat; daftar kosong = hapus key. Gagal (penuh/diblokir) = diabaikan. */
export function saveChatHistory(
  userId: string,
  messages: ChatMessage[],
): void {
  if (typeof window === "undefined") return;
  try {
    const clean = messages
      .filter((message) => message.content.trim())
      .slice(-CHAT_MAX_STORED);
    if (clean.length === 0) {
      window.localStorage.removeItem(chatStorageKey(userId));
    } else {
      window.localStorage.setItem(
        chatStorageKey(userId),
        JSON.stringify(clean),
      );
    }
  } catch {
    // storage tidak tersedia: chat tetap jalan, hanya tidak diingat.
  }
}
