"use client";

import Link from "next/link";
import { motion } from "motion/react";
import type { SessionUser } from "@/lib/auth/types";
import { LeafIcon } from "@/components/dashboard/icons";
import { itemVariants } from "@/components/dashboard/motion-variants";

const NAV_LINKS = [
  { href: "/#fitur", label: "Fitur" },
  { href: "/#cara-kerja", label: "Cara kerja" },
  { href: "/#mulai", label: "Mulai" },
];

type NavbarProps = {
  session: SessionUser | null;
};

export function Navbar({ session }: NavbarProps) {
  const hasSession = session !== null;

  return (
    <motion.header
      variants={itemVariants}
      initial="hidden"
      animate="show"
      className="sticky top-0 z-40 border-b border-white/20 bg-forest-night/55 backdrop-blur-xl backdrop-blur"
    >
      <nav className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-forest-lime text-forest-night shadow-glass-sm">
            <LeafIcon className="h-4 w-4" />
          </span>
          <span className="text-base font-semibold text-forest-mist">
            Mossifier
          </span>
        </Link>

        <div className="hidden items-center gap-6 text-sm font-medium text-forest-mist/70 md:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="transition-colors hover:text-forest-mist"
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-2.5">
          {hasSession ? (
            <motion.a
              href="/dashboard"
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              className="rounded-full bg-forest-lime px-4 py-2 text-xs font-medium text-forest-night shadow-glass-sm"
            >
              Buka Dashboard
            </motion.a>
          ) : (
            <>
              <motion.a
                href="/login"
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                className="rounded-full border border-white/20 px-4 py-2 text-xs font-medium text-forest-mist shadow-glass-sm"
              >
                Masuk
              </motion.a>
              <motion.a
                href="/register"
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                className="rounded-full bg-forest-lime px-4 py-2 text-xs font-medium text-forest-night shadow-glass-sm"
              >
                Daftar
              </motion.a>
            </>
          )}
        </div>
      </nav>
    </motion.header>
  );
}
