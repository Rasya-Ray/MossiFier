"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "react-toastify";
import { useSession } from "@/components/auth/session-provider";
import { useDevice } from "@/components/device/device-provider";
import { clearDeviceId } from "@/lib/device-store";
import {
  CloseIcon,
  DropletIcon,
  HomeIcon,
  LogoutIcon,
  MenuIcon,
  SignalIcon,
  SproutIcon,
  SunIcon,
  WindIcon,
} from "@/components/dashboard/icons";
import { itemVariants } from "@/components/dashboard/motion-variants";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: HomeIcon },
  { href: "/dashboard/air-quality", label: "Air Quality", icon: SignalIcon },
  { href: "/dashboard/kelembapan", label: "Kelembapan", icon: DropletIcon },
  {
    href: "/dashboard/kecepatan-fan",
    label: "Kecepatan Fan",
    icon: WindIcon,
  },
  { href: "/dashboard/kecerahan", label: "Kecerahan LED", icon: SunIcon },
  {
    href: "/dashboard/status-tanaman",
    label: "Status Tanaman",
    icon: SproutIcon,
  },
];

function isActive(pathname: string, href: string): boolean {
  return href === "/dashboard"
    ? pathname === "/dashboard"
    : pathname.startsWith(href);
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const session = useSession();
  const { deviceId, openDialog } = useDevice();
  const [menuOpen, setMenuOpen] = useState(false);

  const userName = session?.name ?? session?.email.split("@")[0] ?? "";

  // Tutup menu otomatis saat navigasi lewat link (sudah ditangani di onClick),
  // jadi tidak perlu efek tambahan yang memanggil setState.

  // Saat menu terbuka: kunci scroll halaman & dukung tombol Escape.
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

  async function handleLogout() {
    setMenuOpen(false);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      // Device dipilih per sesi login, jadi jangan diwariskan ke akun berikutnya.
      clearDeviceId();
      toast.info("Anda telah keluar dari Mossifier.");
      router.replace("/login");
      router.refresh();
    }
  }

  // Tutup drawer dulu, baru buka dialog device (dialog z-index-nya lebih rendah).
  function handleOpenDeviceDialog() {
    setMenuOpen(false);
    openDialog();
  }

  const navList = (
    <ul className="space-y-1.5">
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              className={`flex items-center gap-3 rounded-2xl px-4 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-forest-lime text-forest-night shadow-glass-sm"
                  : "text-forest-mist/70 hover:bg-white/10 hover:text-forest-mist"
              }`}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );

  const userCard = (
    <div className="rounded-2xl bg-white/10 p-4 shadow-glass-sm">
      <p className="text-xs text-forest-mist/60">Masuk sebagai</p>
      <p className="mt-1 truncate text-sm font-semibold text-forest-mist">
        {userName || "—"}
      </p>
      <p className="truncate text-[11px] text-forest-mist/60">
        {session?.email ?? ""}
      </p>
      <motion.button
        type="button"
        onClick={handleLogout}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.97 }}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-full border border-white/20 bg-white/10 backdrop-blur-xl py-2 text-xs font-medium text-forest-mist shadow-glass-sm"
      >
        <LogoutIcon className="h-3.5 w-3.5" />
        Keluar
      </motion.button>
    </div>
  );

  const deviceCard = (
    <div className="rounded-2xl bg-white/10 p-4 shadow-glass-sm">
      <p className="text-xs text-forest-mist/60">Device aktif</p>
      <p className="mt-1 truncate text-sm font-semibold text-forest-mist">
        {deviceId ?? "Belum dipilih"}
      </p>
      <motion.button
        type="button"
        onClick={handleOpenDeviceDialog}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.97 }}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-forest-lime py-2 text-xs font-medium text-forest-night shadow-glass-sm"
      >
        <SignalIcon className="h-3.5 w-3.5" />
        {deviceId ? "Ganti device" : "Tambah device"}
      </motion.button>
    </div>
  );

  return (
    <>
      {/* Sidebar desktop */}
      <motion.aside
        initial="hidden"
        animate="show"
        variants={itemVariants}
        className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-white/20 bg-white/10 backdrop-blur-xl px-5 py-6 lg:flex"
      >
        <Link href="/" className="flex items-center gap-2.5">
          <Image
            src="/logo-website.png"
            alt="Mossifier"
            width={36}
            height={36}
            className="h-9 w-9 object-contain"
          />
          <span className="text-base font-semibold text-forest-mist">
            Mossifier
          </span>
        </Link>

        <nav className="mt-8 flex-1">{navList}</nav>

        <div className="space-y-3">
          {deviceCard}
          {userCard}
        </div>
      </motion.aside>

      {/* Topbar mobile & tablet */}
      <header className="sticky top-0 z-30 border-b border-white/20 bg-forest-night/55 backdrop-blur-xl lg:hidden">
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <Link href="/" className="flex min-w-0 items-center gap-2">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-forest-lime shadow-sm">
              <Image
                src="/logo-website.png"
                alt="MossiFier"
                width={36}
                height={36}
                className="h-9 w-9 object-contain"
              />
            </span>
            <span className="truncate text-sm font-semibold text-forest-mist">
              Mossifier
            </span>
          </Link>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={openDialog}
              className="flex max-w-32 items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-2 text-xs font-medium text-forest-mist sm:max-w-44"
            >
              <SignalIcon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{deviceId ?? "Tambah device"}</span>
            </button>
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Buka menu navigasi"
              aria-expanded={menuOpen}
              aria-controls="dashboard-mobile-menu"
              className="grid h-10 w-10 place-items-center rounded-xl border border-white/20 bg-white/10 text-forest-mist shadow-glass-sm transition-colors hover:bg-white/15"
            >
              <MenuIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Drawer menu (HP & tablet) */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div key="mobile-menu" className="fixed inset-0 z-[60] lg:hidden">
            <motion.button
              type="button"
              aria-label="Tutup menu"
              onClick={() => setMenuOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 h-full w-full cursor-default bg-forest-night/70 backdrop-blur-sm"
            />

            <motion.aside
              id="dashboard-mobile-menu"
              role="dialog"
              aria-modal="true"
              aria-label="Menu dashboard"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 32 }}
              className="absolute inset-y-0 right-0 flex w-[min(20rem,86vw)] flex-col overflow-y-auto rounded-l-[1.75rem] border-l border-white/20 bg-forest-night/90 px-5 py-5 shadow-glass backdrop-blur-2xl"
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

              <nav className="mt-7 flex-1">
                <p className="px-2 text-[11px] font-medium tracking-[0.2em] text-forest-mist/50 uppercase">
                  Menu
                </p>
                <ul className="mt-2 space-y-1.5">
                  {NAV_ITEMS.map((item) => {
                    const active = isActive(pathname, item.href);
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={() => setMenuOpen(false)}
                          aria-current={active ? "page" : undefined}
                          className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-colors ${
                            active
                              ? "bg-forest-lime text-forest-night shadow-glass-sm"
                              : "text-forest-mist/70 hover:bg-white/10 hover:text-forest-mist"
                          }`}
                        >
                          <item.icon className="h-4 w-4 shrink-0" />
                          {item.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </nav>

              <div className="mt-6 space-y-3">
                {deviceCard}
                {userCard}
              </div>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
