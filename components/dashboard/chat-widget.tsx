"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useDevice } from "@/components/device/device-provider";
import { LoadingFace } from "@/components/ui";
import { ChatMarkdown } from "@/components/dashboard/chat-markdown";
import { SignalIcon } from "@/components/dashboard/icons";
import {
  CHAT_MAX_HISTORY,
  CHAT_MAX_MESSAGE_CHARS,
  type ChatHistoryResponse,
  type ChatMessage,
} from "@/lib/chat/types";
import Image from "next/image";

const SUGGESTIONS = [
  "Gimana kondisi lumut sekarang?",
  "Apakah CO₂ di ruangan aman?",
  "Kelembapannya sudah ideal belum?",
  "Kenapa lumut bisa jadi coklat?",
];

const GREETING =
  "Halo! Aku Kibo. Tanya apa saja soal lumut, kualitas udara, atau data sensor perangkatmu.";

const TRANSIENT_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Tombol chat melayang (kanan bawah) + popup percakapan dengan AI.
 * Dipasang di app/dashboard/layout.tsx.
 *
 * Riwayat tidak cuma disimpan di state: saat widget dibuka, ia mengambil
 * ingatan per akun dari Redis lewat GET /api/chat/history. Server juga
 * mencoba ulang otomatis kalau chat pertama gagal (lihat lib/chat/upstream.ts).
 */
export function ChatWidget() {
  const { deviceId, openDialog } = useDevice();
  const reduceMotion = useReducedMotion();

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const pendingRef = useRef(false);

  // Hentikan stream yang masih jalan saat widget di-unmount (mis. logout).
  useEffect(() => () => abortRef.current?.abort(), []);

  // Pulihkan ingatan Kibo dari server (Redis), aman kalau endpoint gagal.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/chat/history", {
          cache: "no-store",
        });
        if (!response.ok) return;
        const data = (await response.json()) as Partial<ChatHistoryResponse>;
        if (cancelled || !Array.isArray(data.messages)) return;
        const saved = data.messages;
        if (saved.length) {
          setMessages((prev) => (prev.length ? prev : saved));
        }
      } catch {
        // Riwayat bersifat tambahan; chat tetap bisa dipakai tanpa ini.
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, pending, open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const requestReply = useCallback(
    async (history: ChatMessage[]) => {
      if (pendingRef.current) return;

      pendingRef.current = true;
      setPending(true);
      setError(null);

      const controller = new AbortController();
      abortRef.current = controller;
      let received = false;
      let lastMessage = "Gagal menghubungi chatbot.";

      try {
        // Percobaan kedua hanya terjadi kalau belum ada satu pun potongan jawaban.
        for (let attempt = 0; attempt < 2; attempt++) {
          let retryable = true;
          try {
            const response = await fetch("/api/chat", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                messages: history.slice(-CHAT_MAX_HISTORY),
                deviceId,
              }),
              signal: controller.signal,
            });

            if (!response.ok || !response.body) {
              const status = response.status;
              const data = (await response.json().catch(() => ({}))) as {
                error?: string;
              };
              lastMessage = data.error ?? lastMessage;
              retryable = status === 429 || TRANSIENT_STATUSES.has(status);
              if (attempt === 0 && retryable) {
                await wait(status === 429 ? 2500 : 1200);
                continue;
              }
              break;
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let reply = "";
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              const piece = decoder.decode(value, { stream: true });
              if (!piece) continue;
              received = true;
              reply += piece;
              const snapshot = reply;
              setMessages((prev) => [
                ...prev.slice(0, -1),
                { role: "assistant", content: snapshot },
              ]);
            }

            if (!reply.trim()) {
              if (attempt === 0) {
                await wait(800);
                continue;
              }
              lastMessage = "AI tidak memberi jawaban. Coba lagi.";
              break;
            }
            return; // berhasil
          } catch (caught) {
            if (controller.signal.aborted) return;
            lastMessage =
              caught instanceof Error ? caught.message : lastMessage;
            if (received || !retryable || attempt === 1) break;
            await wait(1200);
          }
        }

        setMessages((prev) =>
          prev.at(-1)?.role === "assistant" && !prev.at(-1)?.content
            ? prev.slice(0, -1)
            : prev,
        );
        setError(lastMessage);
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        pendingRef.current = false;
        setPending(false);
      }
    },
    [deviceId],
  );

  const send = useCallback(
    (rawText: string) => {
      const text = rawText.trim().slice(0, CHAT_MAX_MESSAGE_CHARS);
      if (!text || pendingRef.current) return;

      const history: ChatMessage[] = [
        ...messages,
        { role: "user", content: text },
      ];
      setMessages([...history, { role: "assistant", content: "" }]);
      setInput("");
      void requestReply(history);
    },
    [messages, requestReply],
  );

  const retryLast = useCallback(() => {
    if (pendingRef.current) return;
    let index = messages.length - 1;
    while (index >= 0 && messages[index].role !== "user") index -= 1;
    if (index < 0) return;

    const history = messages.slice(0, index + 1);
    setMessages([...history, { role: "assistant", content: "" }]);
    void requestReply(history);
  }, [messages, requestReply]);

  function clearChat() {
    abortRef.current?.abort();
    setMessages([]);
    setError(null);
    setPending(false);
    pendingRef.current = false;
    void fetch("/api/chat/history", { method: "DELETE" }).catch(() => {
      // Penghapusan lokal tetap berlalu walau server sedang bermasalah.
    });
  }

  const lastMessage = messages.at(-1);
  const canRetry = Boolean(error && !pending && lastMessage?.role === "user");

  return (
    <div className="pointer-events-none fixed inset-0 z-40">
      <AnimatePresence>
        {open && (
          <motion.section
            key="chat-panel"
            role="dialog"
            aria-label="Chat Kibo"
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 300, damping: 26 }}
            onKeyDown={(event) => {
              if (event.key === "Escape") setOpen(false);
            }}
            className="pointer-events-auto absolute right-4 bottom-24 flex h-[min(34rem,calc(100dvh-8rem))] w-[calc(100vw-2rem)] origin-bottom-right flex-col overflow-hidden rounded-3xl border border-white/20 bg-forest-night/60 shadow-glass backdrop-blur-2xl sm:right-6 sm:bottom-28 sm:w-96"
          >
            {/* Header */}
            <header className="flex items-center gap-3 border-b border-white/15 px-4 py-3">
              <Image
                src="/logo-chatbot.png"
                alt="Kibo"
                width={48}
                height={48}
                className="h-12 w-12 shrink-0 object-contain drop-shadow-lg"
              />
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-sm font-semibold text-forest-mist">
                  Kibo
                </h2>
                <button
                  type="button"
                  onClick={openDialog}
                  className="flex max-w-full items-center gap-1 truncate text-[11px] text-forest-mist/70 hover:text-forest-mist"
                >
                  <SignalIcon className="h-3 w-3 shrink-0" />
                  <span className="truncate">
                    {deviceId ? `Data: ${deviceId}` : "Pilih device dulu"}
                  </span>
                </button>
              </div>
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={clearChat}
                  title="Hapus riwayat dan ingatan Kibo untuk akun ini"
                  className="rounded-full border border-white/20 px-3 py-1 text-[11px] font-medium text-forest-mist/80 hover:bg-white/10"
                >
                  Hapus
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Tutup chat"
                className="grid h-8 w-8 place-items-center rounded-full text-forest-mist/80 hover:bg-white/10"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </header>

            {/* Pesan */}
            <div
              className="flex-1 space-y-3 overflow-y-auto px-4 py-4"
              aria-live="polite"
            >
              <div className="max-w-[88%] rounded-2xl rounded-tl-md border border-white/15 bg-white/10 px-3.5 py-2.5 text-sm leading-6 text-forest-mist">
                {GREETING}
              </div>

              {hydrated && messages.length === 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => send(suggestion)}
                      className="rounded-full border border-forest-lime/40 bg-white/5 px-3 py-1.5 text-xs font-medium text-forest-mist hover:bg-white/15"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}

              {messages.map((message, index) =>
                message.role === "user" ? (
                  <div key={index} className="flex justify-end">
                    <p className="max-w-[88%] rounded-2xl rounded-tr-md bg-forest-lime px-3.5 py-2.5 text-sm leading-6 break-words whitespace-pre-wrap text-forest-night">
                      {message.content}
                    </p>
                  </div>
                ) : message.content ? (
                  <div
                    key={index}
                    className="max-w-[92%] rounded-2xl rounded-tl-md border border-white/15 bg-white/10 px-3.5 py-2.5 text-sm leading-6 break-words text-forest-mist/90"
                  >
                    <ChatMarkdown text={message.content} />
                  </div>
                ) : null,
              )}

              {pending && lastMessage?.role === "assistant" && !lastMessage.content && (
                <div className="flex items-center gap-2 text-xs text-forest-mist/70">
                  <LoadingFace size="sm" label={null} tone="light" />
                  Mengetik…
                </div>
              )}

              {error && (
                <div className="rounded-2xl border border-white/20 bg-forest-pine/60 px-3.5 py-2.5 text-xs leading-5 text-forest-mist">
                  <p role="alert">{error}</p>
                  {canRetry && (
                    <button
                      type="button"
                      onClick={retryLast}
                      className="mt-2 rounded-full border border-forest-lime/50 px-3 py-1 font-medium text-forest-mist hover:bg-white/10"
                    >
                      Coba lagi
                    </button>
                  )}
                </div>
              )}

              <div ref={endRef} />
            </div>

            {/* Input */}
            <form
              onSubmit={(event) => {
                event.preventDefault();
                send(input);
              }}
              className="flex items-end gap-2 border-t border-white/15 p-3"
            >
              <textarea
                ref={inputRef}
                value={input}
                rows={1}
                maxLength={CHAT_MAX_MESSAGE_CHARS}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    send(input);
                  }
                }}
                placeholder="Tanya soal lumut atau udara…"
                aria-label="Pesan"
                className="field-sizing-content max-h-28 min-h-10 flex-1 resize-none rounded-2xl border border-white/20 bg-forest-night/30 px-3.5 py-2.5 text-base text-forest-mist shadow-glass-inset outline-none placeholder:text-forest-mist/50 focus:border-forest-lime sm:text-sm"
              />
              <button
                type="submit"
                disabled={pending || !input.trim()}
                aria-label="Kirim"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-forest-lime text-forest-night transition-opacity disabled:opacity-40"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </button>
            </form>
          </motion.section>
        )}
      </AnimatePresence>

      {/*
        Tombol melayang.
        PENTING: animasi masuk/keluar (finite, spring) ada di pembungkus, sedangkan
        animasi melayang (repeat tak terbatas) ada di tombol di dalamnya. Jangan
        digabung: `transition` dengan repeat: Infinity ikut dipakai animasi `exit`
        sehingga fade-out berulang terus dan tombol terlihat berkedip.
      */}
      <AnimatePresence>
        {!open && (
          <motion.div
            key="chat-fab"
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={{ type: "spring", stiffness: 320, damping: 24 }}
            className="pointer-events-auto fixed right-4 bottom-4 z-50 sm:right-6 sm:bottom-6"
          >
            <motion.button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Buka chatbot Kibo"
              animate={reduceMotion ? undefined : { y: [0, -6, 0] }}
              transition={
                reduceMotion
                  ? undefined
                  : { duration: 3, repeat: Infinity, ease: "easeInOut" }
              }
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.94 }}
              className="block h-[4.5rem] w-[4.5rem] cursor-pointer rounded-full drop-shadow-xl sm:h-20 sm:w-20"
            >
              <Image
                src="/logo-chatbot.png"
                alt=""
                width={80}
                height={80}
                className="h-full w-full object-contain"
              />
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
