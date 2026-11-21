"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { motion } from "motion/react";
import { toast } from "react-toastify";
import { itemVariants } from "@/components/dashboard/motion-variants";
import { BrandLogo } from "@/components/layout/brand-logo";

type AuthResponse = {
  user?: { id: string; email: string; name: string | null };
  error?: string;
};

export function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const mail = email.trim();
    if (!mail || !password) {
      toast.error("Email dan password wajib diisi.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: mail, password }),
      });
      const data = (await response.json().catch(() => ({}))) as AuthResponse;

      if (!response.ok) {
        toast.error(data.error ?? "Gagal masuk.");
        return;
      }

      toast.success(
        `Selamat datang, ${data.user?.name ?? data.user?.email ?? "pengguna"}!`,
      );
      router.replace("/dashboard");
      router.refresh();
    } catch {
      toast.error("Server tidak bisa dihubungi. Coba lagi sebentar ya.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <motion.main
      initial="hidden"
      animate="show"
      variants={itemVariants}
      className="mx-auto flex w-full max-w-md flex-col items-center px-4 py-10 sm:px-5 sm:py-16"
    >
      <motion.span
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, ease: "backOut" }}
        className="grid place-items-center"
      >
        <BrandLogo size={104} priority />
      </motion.span>

      <h1 className="mt-6 text-2xl font-semibold text-forest-mist">
        Selamat datang kembali
      </h1>
      <p className="mt-2 text-center text-sm text-forest-mist/70">
        Masuk untuk melihat kondisi lumut dan udara di perangkatmu.
      </p>

      <motion.form
        onSubmit={handleSubmit}
        className="mt-8 w-full rounded-3xl border border-white/20 bg-white/10 p-5 shadow-glass backdrop-blur-xl sm:p-8"
      >
        <label className="block text-xs font-medium text-forest-mist/80">
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="nama@email.com"
            autoComplete="email"
            className="mt-2 w-full rounded-2xl border border-white/20 bg-forest-night/30 px-4 py-3 text-base text-forest-mist shadow-glass-inset outline-none placeholder:text-forest-mist/50 focus:border-forest-lime sm:text-sm"
          />
        </label>

        <label className="mt-5 block text-xs font-medium text-forest-mist/80">
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            className="mt-2 w-full rounded-2xl border border-white/20 bg-forest-night/30 px-4 py-3 text-base text-forest-mist shadow-glass-inset outline-none placeholder:text-forest-mist/50 focus:border-forest-lime sm:text-sm"
          />
        </label>

        <motion.button
          type="submit"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          disabled={submitting}
          className="mt-7 w-full rounded-full bg-forest-lime py-3 text-sm font-medium text-forest-night shadow-glass disabled:opacity-70"
        >
          {submitting ? "Memeriksa…" : "Masuk"}
        </motion.button>
      </motion.form>

      <p className="mt-6 text-sm text-forest-mist/70">
        Belum punya akun?{" "}
        <Link
          href="/register"
          className="font-semibold text-forest-mist underline decoration-forest-lime decoration-2 underline-offset-2"
        >
          Daftar
        </Link>
      </p>
    </motion.main>
  );
}
