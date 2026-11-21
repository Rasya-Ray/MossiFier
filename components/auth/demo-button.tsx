"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { motion } from "motion/react";
import { toast } from "react-toastify";
import { SparkleIcon } from "@/components/dashboard/icons";

type DemoResponse = {
  user?: { id: string; email: string; name: string | null };
  error?: string;
};

type DemoButtonProps = {
  className?: string;
  /** Versi ringkas untuk navbar (label "Demo"). */
  compact?: boolean;
  /** Dipanggil setelah sesi demo aktif, mis. untuk menutup menu mobile. */
  onSuccess?: () => void;
};

/**
 * Tombol "Demo (untuk juri)" di halaman login/register.
 * Satu klik → sesi demo dibuat server → langsung ke dashboard,
 * lengkap dengan Device ID demo (tanpa isi form apa pun).
 */
export function DemoButton({
  className = "",
  compact = false,
  onSuccess,
}: DemoButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDemo() {
    if (loading) return;

    setLoading(true);
    try {
      const response = await fetch("/api/auth/demo", { method: "POST" });
      const data = (await response.json().catch(() => ({}))) as DemoResponse;

      if (!response.ok) {
        toast.error(data.error ?? "Gagal membuka mode demo.");
        return;
      }

      toast.success("Mode demo aktif. Selamat mencoba!");
      onSuccess?.();
      router.replace("/dashboard");
      router.refresh();
    } catch {
      toast.error("Tidak bisa menghubungi server.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <motion.button
      type="button"
      onClick={handleDemo}
      disabled={loading}
      aria-label="Buka mode demo untuk juri"
      title="Buka mode demo untuk juri"
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      className={`flex items-center justify-center gap-2 rounded-full border border-forest-lime/60 bg-white/10 font-medium text-forest-mist shadow-glass-sm backdrop-blur-xl transition-colors hover:border-forest-lime hover:bg-white/15 disabled:opacity-70 ${
        compact ? "px-4 py-2 text-xs" : "w-full py-3 text-sm"
      } ${className}`}
    >
      <SparkleIcon className={`${compact ? "h-3.5 w-3.5" : "h-4 w-4"} text-forest-lime`} />
      {loading ? "Menyiapkan demo…" : compact ? "Demo" : "Demo (untuk juri)"}
    </motion.button>
  );
}
