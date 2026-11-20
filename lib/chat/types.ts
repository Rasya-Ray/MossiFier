/** Tipe bersama untuk chatbot Mossifier (client + server). */

export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

/** Batas input — divalidasi ulang di server (`app/api/chat/route.ts`). */
export const CHAT_MAX_MESSAGE_CHARS = 1000;
export const CHAT_MAX_HISTORY = 12;

/** Body request POST /api/chat. */
export type ChatRequestBody = {
  messages: ChatMessage[];
  deviceId: string | null;
};
