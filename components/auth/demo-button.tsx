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
};

/**
 * Tombol "Demo (untuk juri)" di halaman login/register.
 * Satu klik → sesi demo dibuat server → langsung ke dashboard,
 * lengkap dengan Device ID demo (tanpa isi form apa pun).
 */
export function DemoButton({ className = "" }: DemoButtonProps) {
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
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      className={`flex w-full items-center justify-center gap-2 rounded-full border border-forest-lime/60 bg-white/10 py-3 text-sm font-medium text-forest-mist shadow-glass-sm backdrop-blur-xl transition-colors hover:border-forest-lime hover:bg-white/15 disabled:opacity-70 ${className}`}
    >
      <SparkleIcon className="h-4 w-4 text-forest-lime" />
      {loading ? "Menyiapkan demo…" : "Demo (untuk juri)"}
    </motion.button>
  );
}
