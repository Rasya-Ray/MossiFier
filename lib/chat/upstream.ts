import dns from "node:dns";

// Beberapa jaringan/Windows mencoba IPv6 dulu dan membuat fetch menggantung.
dns.setDefaultResultOrder("ipv4first");

/**
 * Lapisan pemanggil OpenRouter untuk Kibo.
 *
 * Kenapa tidak langsung `fetch` di route: chat pertama setelah login sering
 * gagal karena penyedia AI sedang sibuk / koneksi pertama timeout. Di sini
 * setiap permintaan dicoba ulang, lalu pindah ke model cadangan. Stream juga
 * "dipanaskan" sampai token pertama muncul SEBELUM respons dikembalikan,
 * supaya error upstream tidak berubah jadi balasan kosong di browser.
 *
 * Env:
 *   OPENROUTER_API_KEY           wajib
 *   OPENROUTER_MODEL             model utama
 *   OPENROUTER_FALLBACK_MODELS   daftar model cadangan, dipisah koma
 *   OPENROUTER_BASE_URL          default https://openrouter.ai/api/v1
 */

export type UpstreamMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatUpstreamFailureKind = "config" | "busy" | "network" | "aborted";

export class ChatUpstreamError extends Error {
  readonly kind: ChatUpstreamFailureKind;
  readonly status: number | null;
  readonly detail: string;

  constructor(
    message: string,
    options: {
      kind: ChatUpstreamFailureKind;
      status?: number | null;
      detail?: string;
    },
  ) {
    super(message);
    this.name = "ChatUpstreamError";
    this.kind = options.kind;
    this.status = options.status ?? null;
    this.detail = options.detail ?? "";
  }
}

const BASE_URL = (
  process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1"
).replace(/\/+$/, "");

const PRIMARY_MODEL =
  process.env.OPENROUTER_MODEL?.trim() || "google/gemini-3.5-flash-lite";

const DEFAULT_FALLBACK_MODELS = [
  "google/gemini-3.1-flash-lite",
  "amazon/nova-2-lite-v1",
];

/** Tunggu token pertama maksimal ini per percobaan, lalu coba lagi. */
const FIRST_TOKEN_TIMEOUT_MS = 20_000;
/** Total waktu seluruh percobaan sebelum menyerah. */
const TOTAL_BUDGET_MS = 70_000;
const MAX_ATTEMPTS = 4;
const RETRY_DELAYS_MS = [350, 700, 1100];

export type OpenedChatReply = {
  /** Token pertama sudah didapat; langsung tampilkan di browser. */
  firstText: string;
  /** Sisanya dibaca setelah respons dikirim. */
  rest: SseTextStream;
  model: string;
  attempts: number;
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function modelPlan(): string[] {
  const configured = (process.env.OPENROUTER_FALLBACK_MODELS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const fallbacks = configured.length ? configured : DEFAULT_FALLBACK_MODELS;
  const models = Array.from(new Set([PRIMARY_MODEL, ...fallbacks]));

  // Model utama dapat 2 percobaan (gangguan singkat), cadangan masing-masing 1.
  const plan: string[] = [];
  for (let index = 0; index < models.length && plan.length < MAX_ATTEMPTS; index++) {
    plan.push(models[index]);
    if (index === 0 && plan.length < MAX_ATTEMPTS) plan.push(models[index]);
  }
  return plan.slice(0, MAX_ATTEMPTS);
}

function classifyStatus(status: number): ChatUpstreamFailureKind {
  if (status === 401 || status === 402 || status === 403) return "config";
  if (status === 400 || status === 413 || status === 422) return "config";
  // 404 model tidak tersedia → percobaan berikutnya pakai model cadangan.
  return "busy";
}

class SseTextStream {
  private readonly reader: ReadableStreamDefaultReader<Uint8Array>;
  private readonly decoder = new TextDecoder();
  private buffer = "";
  /** Potongan yang sudah terurai tapi belum diambil pemanggil. */
  private pending: string[] = [];
  private finished = false;

  constructor(body: ReadableStream<Uint8Array>) {
    this.reader = body.getReader();
  }

  /** Potongan teks berikutnya, atau `null` kalau stream selesai. */
  async next(): Promise<string | null> {
    for (;;) {
      if (this.pending.length) return this.pending.shift() ?? null;
      if (this.finished) return null;

      const { done, value } = await this.reader.read();
      if (done) {
        this.finished = true;
        const tail = this.buffer.trim();
        this.buffer = "";
        if (tail) this.pushLine(tail);
        continue;
      }

      this.buffer += this.decoder.decode(value, { stream: true });
      this.flushBuffer();
    }
  }

  /** Urai semua baris lengkap di buffer, termasuk sisa dari chunk sebelumnya. */
  private flushBuffer(): void {
    let newline = this.buffer.indexOf("\n");
    while (newline >= 0) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      this.pushLine(line);
      newline = this.buffer.indexOf("\n");
    }
  }

  private pushLine(line: string): void {
    const piece = this.readLine(line);
    if (piece) this.pending.push(piece);
  }

  private readLine(line: string): string | null {
    if (!line.startsWith("data:")) return null; // komentar SSE, mis. ": ping"
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") return null;

    let json: {
      choices?: Array<{ delta?: { content?: string | null } }>;
      error?: { message?: string };
    };
    try {
      json = JSON.parse(payload);
    } catch {
      return null;
    }

    if (json.error) {
      throw new ChatUpstreamError("stream AI menampilkan error", {
        kind: "busy",
        detail: json.error.message ?? "",
      });
    }

    const piece = json.choices?.[0]?.delta?.content;
    return typeof piece === "string" && piece.length ? piece : null;
  }

  async cancel(reason?: unknown): Promise<void> {
    this.finished = true;
    this.pending = [];
    try {
      await this.reader.cancel(reason);
    } catch {
      // stream memang sudah tertutup.
    }
  }
}

async function requestOnce(
  model: string,
  messages: UpstreamMessage[],
  apiKey: string,
  clientSignal?: AbortSignal,
): Promise<{ reader: SseTextStream; firstText: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FIRST_TOKEN_TIMEOUT_MS);
  const signal = clientSignal
    ? AbortSignal.any([clientSignal, controller.signal])
    : controller.signal;

  let reader: SseTextStream | null = null;
  try {
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
        "X-Title": "Mossifier",
      },
      body: JSON.stringify({
        model,
        stream: true,
        temperature: 0.7,
        max_tokens: 900,
        messages,
      }),
      signal,
    });

    if (!response.ok || !response.body) {
      const detail = await response.text().catch(() => "");
      throw new ChatUpstreamError("penyedia AI menolak permintaan", {
        kind: classifyStatus(response.status),
        status: response.status,
        detail,
      });
    }

    reader = new SseTextStream(response.body);
    const firstText = await reader.next();
    if (!firstText) {
      await reader.cancel();
      throw new ChatUpstreamError("AI tidak mengirim isi jawaban", {
        kind: "busy",
        status: 502,
      });
    }
    return { reader, firstText };
  } catch (error) {
    if (reader) await reader.cancel();
    if (clientSignal?.aborted) {
      throw new ChatUpstreamError("permintaan dibatalkan klien", {
        kind: "aborted",
      });
    }
    if (error instanceof ChatUpstreamError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new ChatUpstreamError("timeout menunggu token pertama", {
        kind: "busy",
      });
    }
    throw new ChatUpstreamError("gagal menghubungi penyedia AI", {
      kind: "network",
      detail: error instanceof Error ? error.message : String(error),
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Buka koneksi AI yang sudah terbukti mengirim token pertama. */
export async function openChatReply(
  messages: UpstreamMessage[],
  clientSignal?: AbortSignal,
): Promise<OpenedChatReply> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new ChatUpstreamError("OPENROUTER_API_KEY belum diisi", {
      kind: "config",
    });
  }

  const plan = modelPlan();
  const startedAt = Date.now();
  let last: ChatUpstreamError | null = null;

  for (let attempt = 0; attempt < plan.length; attempt++) {
    if (clientSignal?.aborted) {
      throw new ChatUpstreamError("permintaan dibatalkan klien", {
        kind: "aborted",
      });
    }
    if (Date.now() - startedAt > TOTAL_BUDGET_MS) break;

    const model = plan[attempt];
    const attemptStart = Date.now();
    try {
      const { reader, firstText } = await requestOnce(
        model,
        messages,
        apiKey,
        clientSignal,
      );
      console.info(
        `[chat] model=${model} attempt=${attempt + 1} first_token=${Date.now() - attemptStart}ms`,
      );
      return { firstText, rest: reader, model, attempts: attempt + 1 };
    } catch (error) {
      const failure =
        error instanceof ChatUpstreamError
          ? error
          : new ChatUpstreamError("percobaan gagal", {
              kind: "network",
              detail: String(error),
            });
      last = failure;
      console.warn(
        `[chat] gagal attempt=${attempt + 1} model=${model} status=${failure.status ?? "-"} kind=${failure.kind} ms=${Date.now() - attemptStart}`,
        failure.detail.slice(0, 240),
      );

      if (failure.kind === "aborted" || failure.kind === "config") {
        throw failure;
      }
      if (attempt < plan.length - 1) {
        await delay(RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)]);
      }
    }
  }

  throw last ?? new ChatUpstreamError("penyedia AI tidak merespons", {
    kind: "busy",
  });
}
