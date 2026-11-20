"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "motion/react";
import { toast } from "react-toastify";
import { useSession } from "@/components/auth/session-provider";
import { useDevice } from "@/components/device/device-provider";
import { clearDeviceId } from "@/lib/device-store";
import {
  DropletIcon,
  HomeIcon,
  LeafIcon,
  LogoutIcon,
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

  const userName = session?.name ?? session?.email.split("@")[0] ?? "";

  async function handleLogout() {
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
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-forest-lime text-forest-night shadow-glass-sm">
            <LeafIcon className="h-4 w-4" />
          </span>
          <span className="text-base font-semibold text-forest-mist">
            Mossifier
          </span>
        </Link>

        <nav className="mt-8 flex-1">{navList}</nav>

        <div className="space-y-3">
          <div className="rounded-2xl bg-white/10 p-4 shadow-glass-sm">
            <p className="text-xs text-forest-mist/60">Device aktif</p>
            <p className="mt-1 truncate text-sm font-semibold text-forest-mist">
              {deviceId ?? "Belum dipilih"}
            </p>
            <motion.button
              type="button"
              onClick={openDialog}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-forest-lime py-2 text-xs font-medium text-forest-night shadow-glass-sm"
            >
              <SignalIcon className="h-3.5 w-3.5" />
              {deviceId ? "Ganti device" : "Tambah device"}
            </motion.button>
          </div>

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
        </div>
      </motion.aside>

      {/* Topbar mobile */}
      <header className="sticky top-0 z-30 border-b border-white/20 bg-forest-night/55 backdrop-blur-xl px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-forest-lime text-forest-night">
              <LeafIcon className="h-3.5 w-3.5" />
            </span>
            <span className="text-sm font-semibold text-forest-mist">
              Mossifier
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={openDialog}
              className="flex max-w-36 items-center gap-1.5 rounded-full border border-white/20 px-3 py-1.5 text-xs font-medium text-forest-mist"
            >
              <SignalIcon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{deviceId ?? "Tambah device"}</span>
            </button>
            <button
              type="button"
              onClick={handleLogout}
              aria-label="Keluar"
              className="grid h-8 w-8 place-items-center rounded-full border border-white/20 text-forest-mist"
            >
              <LogoutIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <nav className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex shrink-0 items-center gap-2 rounded-full px-3.5 py-2 text-xs font-medium ${
                  active
                    ? "bg-forest-lime text-forest-night"
                    : "bg-white/10 text-forest-mist/80"
                }`}
              >
                <item.icon className="h-3.5 w-3.5" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
    </>
  );
}
