"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { motion } from "motion/react";
import { toast } from "react-toastify";
import { LeafIcon } from "@/components/dashboard/icons";
import { itemVariants } from "@/components/dashboard/motion-variants";

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
        `Selamat datang, ${data.user?.name ?? data.user?.email ?? "kamu"}!`,
      );
      router.replace("/dashboard");
      router.refresh();
    } catch {
      toast.error("Tidak bisa menghubungi server.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <motion.main
      initial="hidden"
      animate="show"
      variants={itemVariants}
      className="mx-auto flex w-full max-w-md flex-col items-center px-5 py-16"
    >
      <motion.span
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, ease: "backOut" }}
        className="grid h-14 w-14 place-items-center rounded-3xl bg-moss-forest text-moss-paper shadow-soft"
      >
        <LeafIcon className="h-6 w-6" />
      </motion.span>

      <h1 className="mt-6 text-2xl font-semibold text-moss-forest">
        Masuk ke Mossifier
      </h1>
      <p className="mt-2 text-center text-sm text-moss-forest/60">
        Gunakan akun yang sudah terdaftar untuk membuka dashboard.
      </p>

      <motion.form
        onSubmit={handleSubmit}
        className="mt-8 w-full rounded-3xl border border-moss-mist/70 bg-moss-paper p-6 shadow-soft sm:p-8"
      >
        <label className="block text-xs font-medium text-moss-forest/70">
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="kamu@email.com"
            autoComplete="email"
            className="mt-2 w-full rounded-2xl border border-moss-mist bg-moss-mist/25 px-4 py-3 text-sm text-moss-forest shadow-soft-inset outline-none placeholder:text-moss-forest/40 focus:border-moss-leaf"
          />
        </label>

        <label className="mt-5 block text-xs font-medium text-moss-forest/70">
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            className="mt-2 w-full rounded-2xl border border-moss-mist bg-moss-mist/25 px-4 py-3 text-sm text-moss-forest shadow-soft-inset outline-none placeholder:text-moss-forest/40 focus:border-moss-leaf"
          />
        </label>

        <motion.button
          type="submit"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          disabled={submitting}
          className="mt-7 w-full rounded-full bg-moss-forest py-3 text-sm font-medium text-moss-paper shadow-soft disabled:opacity-70"
        >
          {submitting ? "Memeriksa…" : "Masuk"}
        </motion.button>
      </motion.form>

      <p className="mt-6 text-sm text-moss-forest/60">
        Belum punya akun?{" "}
        <Link
          href="/register"
          className="font-semibold text-moss-forest underline decoration-moss-leaf decoration-2 underline-offset-2"
        >
          Daftar
        </Link>
      </p>
    </motion.main>
  );
}
