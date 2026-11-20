import dns from "node:dns";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { SYSTEM_PROMPT } from "@/lib/chat/knowledge";
import { buildSensorContext, isValidDeviceId } from "@/lib/chat/sensor-context";
import {
  CHAT_MAX_HISTORY,
  CHAT_MAX_MESSAGE_CHARS,
  type ChatMessage,
} from "@/lib/chat/types";

// Hindari connect timeout di sebagian jaringan/Windows (Node mencoba IPv6 dulu).
dns.setDefaultResultOrder("ipv4first");

/**
 * POST /api/chat — chatbot Mossifier (OpenRouter, streaming teks biasa).
 *
 * Env (server-only, simpan di `.env`):
 *   OPENROUTER_API_KEY   wajib
 *   OPENROUTER_MODEL     opsional, default google/gemini-3.5-flash-lite
 *   OPENROUTER_BASE_URL  opsional, default https://openrouter.ai/api/v1
 *
 * Kunci API TIDAK pernah dikirim ke browser: client hanya memanggil route ini.
 * Format request = OpenAI-compatible, jadi penyedia lain juga bisa dipakai
 * hanya dengan mengganti BASE_URL + MODEL + key.
 */

const BASE_URL = (
  process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1"
).replace(/\/+$/, "");
const MODEL = process.env.OPENROUTER_MODEL ?? "google/gemini-3.5-flash-lite";

/** Rate limit sederhana per user (in-memory; per instance server). */
const RATE_LIMIT = 15;
const RATE_WINDOW_MS = 60_000;
const hits = new Map<string, number[]>();

function rateLimited(userId: string): boolean {
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter(
    (time) => now - time < RATE_WINDOW_MS,
  );
  if (recent.length >= RATE_LIMIT) {
    hits.set(userId, recent);
    return true;
  }
  recent.push(now);
  hits.set(userId, recent);
  return false;
}

function parseMessages(raw: unknown): ChatMessage[] | null {
  if (!Array.isArray(raw)) return null;

  const messages: ChatMessage[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) return null;
    const { role, content } = item as { role?: unknown; content?: unknown };
    if (role !== "user" && role !== "assistant") return null;
    if (typeof content !== "string") return null;
    const text = content.trim().slice(0, CHAT_MAX_MESSAGE_CHARS);
    if (text) messages.push({ role, content: text });
  }

  const recent = messages.slice(-CHAT_MAX_HISTORY);
  // Percakapan harus berakhir dengan pesan user.
  return recent.at(-1)?.role === "user" ? recent : null;
}

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

/** Ubah stream SSE (`data: {...}`) menjadi stream teks polos. Baris komentar SSE (": ...") diabaikan. */
function toTextStream(upstream: ReadableStream<Uint8Array>) {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let newline: number;
          while ((newline = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, newline).trim();
            buffer = buffer.slice(newline + 1);
            if (!line.startsWith("data:")) continue;

            const payload = line.slice(5).trim();
            if (payload === "[DONE]") continue;
            try {
              const json = JSON.parse(payload) as {
                choices?: Array<{ delta?: { content?: string | null } }>;
              };
              const piece = json.choices?.[0]?.delta?.content;
              if (piece) controller.enqueue(encoder.encode(piece));
            } catch {
              // baris SSE tidak lengkap/bukan JSON: lewati
            }
          }
        }
        controller.close();
      } catch (error) {
        console.error("[chat] stream terputus", error);
        controller.error(error);
      }
    },
    cancel() {
      void upstream.cancel();
    },
  });
}

export async function POST(request: Request) {
  const user = await getSession();
  if (!user) return jsonError("Silakan masuk dulu.", 401);

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error("[chat] OPENROUTER_API_KEY belum diisi di .env");
    return jsonError("Chatbot belum dikonfigurasi di server.", 503);
  }

  const body = (await request.json().catch(() => null)) as {
    messages?: unknown;
    deviceId?: unknown;
  } | null;

  const messages = parseMessages(body?.messages);
  if (!messages) return jsonError("Pesan tidak valid.", 400);

  const deviceId = isValidDeviceId(body?.deviceId) ? body.deviceId : null;

  if (rateLimited(user.id)) {
    return jsonError("Terlalu banyak pesan. Tunggu sebentar ya.", 429);
  }

  const sensorContext = await buildSensorContext(deviceId);

  let upstream: Response;
  try {
    upstream = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        // Opsional: atribusi aplikasi di dashboard OpenRouter.
        "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
        "X-Title": "Mossifier",
      },
      body: JSON.stringify({
        model: MODEL,
        stream: true,
        temperature: 0.5,
        max_tokens: 1000,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "system", content: sensorContext },
          ...messages,
        ],
      }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (error) {
    console.error("[chat] gagal menghubungi OpenRouter", error);
    return jsonError("Tidak bisa menghubungi layanan AI.", 502);
  }

  if (!upstream.ok || !upstream.body) {
    // Detail error hanya di log server; jangan bocorkan ke client.
    console.error("[chat] OpenRouter", upstream.status, await upstream.text());
    return jsonError(
      upstream.status === 401 || upstream.status === 402
        ? "Layanan AI sedang bermasalah (kunci/saldo). Hubungi admin."
        : "Layanan AI sedang sibuk. Coba lagi sebentar.",
      502,
    );
  }

  return new Response(toTextStream(upstream.body), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
