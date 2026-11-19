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

export function Register() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const trimmedName = name.trim();
    const mail = email.trim();

    if (!trimmedName || !mail || !password) {
      toast.error("Nama, email, dan password wajib diisi.");
      return;
    }
    if (password.length < 6) {
      toast.error("Password minimal 6 karakter.");
      return;
    }
    if (password !== confirm) {
      toast.error("Konfirmasi password belum sama.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          email: mail,
          password,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as AuthResponse;

      if (!response.ok) {
        toast.error(data.error ?? "Gagal membuat akun.");
        return;
      }

      toast.success(`Akun ${trimmedName} dibuat. Selamat datang!`);
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
        Buat akun Mossifier
      </h1>
      <p className="mt-2 text-center text-sm text-moss-forest/60">
        Akun disimpan di database, jadi bisa dipakai login kapan saja.
      </p>

      <motion.form
        onSubmit={handleSubmit}
        className="mt-8 w-full rounded-3xl border border-moss-mist/70 bg-moss-paper p-6 shadow-soft sm:p-8"
      >
        <label className="block text-xs font-medium text-moss-forest/70">
          Nama
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Nama kamu"
            autoComplete="name"
            className="mt-2 w-full rounded-2xl border border-moss-mist bg-moss-mist/25 px-4 py-3 text-sm text-moss-forest shadow-soft-inset outline-none placeholder:text-moss-forest/40 focus:border-moss-leaf"
          />
        </label>

        <label className="mt-5 block text-xs font-medium text-moss-forest/70">
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
            placeholder="Minimal 6 karakter"
            autoComplete="new-password"
            className="mt-2 w-full rounded-2xl border border-moss-mist bg-moss-mist/25 px-4 py-3 text-sm text-moss-forest shadow-soft-inset outline-none placeholder:text-moss-forest/40 focus:border-moss-leaf"
          />
        </label>

        <label className="mt-5 block text-xs font-medium text-moss-forest/70">
          Konfirmasi password
          <input
            type="password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            placeholder="Ulangi password"
            autoComplete="new-password"
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
          {submitting ? "Membuat akun…" : "Daftar"}
        </motion.button>
      </motion.form>

      <p className="mt-6 text-sm text-moss-forest/60">
        Sudah punya akun?{" "}
        <Link
          href="/login"
          className="font-semibold text-moss-forest underline decoration-moss-leaf decoration-2 underline-offset-2"
        >
          Masuk
        </Link>
      </p>
    </motion.main>
  );
}
