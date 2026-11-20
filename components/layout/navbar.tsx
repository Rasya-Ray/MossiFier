"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { AnimatePresence, motion } from "motion/react";
import type { SessionUser } from "@/lib/auth/types";
import { CloseIcon, MenuIcon } from "@/components/dashboard/icons";
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
  const [menuOpen, setMenuOpen] = useState(false);

  // Kunci scroll & dukung Escape saat menu mobile terbuka.
  useEffect(() => {
    if (!menuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const authActions = hasSession ? (
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
  );

  return (
    <>
      <motion.header
        variants={itemVariants}
        initial="hidden"
        animate="show"
        className="sticky top-0 z-40 border-b border-white/20 bg-forest-night/55 backdrop-blur-xl backdrop-blur"
      >
      <nav className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-8 sm:py-4">
        <Link href="/" className="flex min-w-0 items-center gap-2.5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-forest-lime shadow-sm sm:h-11 sm:w-11">
            <Image
              src="/logo-website.png"
              alt="MossiFier"
              width={40}
              height={40}
              className="h-9 w-9 object-contain sm:h-10 sm:w-10"
            />
          </span>
          <span className="truncate text-base font-semibold text-forest-mist">
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

        <div className="hidden items-center gap-2.5 md:flex">
          {authActions}
        </div>

        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label="Buka menu navigasi"
          aria-expanded={menuOpen}
          aria-controls="public-mobile-menu"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/20 bg-white/10 text-forest-mist shadow-glass-sm transition-colors hover:bg-white/15 md:hidden"
        >
          <MenuIcon className="h-5 w-5" />
        </button>
      </nav>
      </motion.header>

      {/* Menu mobile */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div key="public-menu" className="fixed inset-0 z-50 md:hidden">
            <motion.button
              type="button"
              aria-label="Tutup menu"
              onClick={() => setMenuOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 h-full w-full cursor-default bg-forest-night/70 backdrop-blur-sm"
            />

            <motion.div
              id="public-mobile-menu"
              initial={{ opacity: 0, y: -16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ type: "spring", stiffness: 300, damping: 28 }}
              className="absolute inset-x-0 top-0 rounded-b-[1.75rem] border-b border-white/20 bg-forest-night/90 px-5 pt-3 pb-6 shadow-glass backdrop-blur-2xl"
            >
              <div className="flex items-center justify-between gap-3">
                <Link
                  href="/"
                  onClick={() => setMenuOpen(false)}
                  className="flex min-w-0 items-center gap-2.5"
                >
                  <Image
                    src="/logo-website.png"
                    alt="Mossifier"
                    width={36}
                    height={36}
                    className="h-9 w-9 shrink-0 object-contain"
                  />
                  <span className="truncate text-base font-semibold text-forest-mist">
                    Mossifier
                  </span>
                </Link>
                <button
                  type="button"
                  onClick={() => setMenuOpen(false)}
                  aria-label="Tutup menu"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/20 text-forest-mist transition-colors hover:bg-white/10"
                >
                  <CloseIcon className="h-5 w-5" />
                </button>
              </div>

              <ul className="mt-5 space-y-1">
                {NAV_LINKS.map((link) => (
                  <li key={link.href}>
                    <a
                      href={link.href}
                      onClick={() => setMenuOpen(false)}
                      className="block rounded-2xl px-4 py-3 text-sm font-medium text-forest-mist/80 transition-colors hover:bg-white/10 hover:text-forest-mist"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>

              <div className="mt-5 flex flex-wrap items-center gap-2.5 border-t border-white/15 pt-5">
                {authActions}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
