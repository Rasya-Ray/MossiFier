"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "react-toastify";
import { useSession } from "@/components/auth/session-provider";
import { saveDeviceId } from "@/lib/device-store";
import {
  DEVICE_ID_EXAMPLE,
  normalizeDeviceId,
} from "@/lib/device-id";
import { SignalIcon } from "@/components/dashboard/icons";

type DeviceDialogProps = {
  open: boolean;
  current: string | null;
  onClose: () => void;
};

/** Modal "Tambah / Ganti device" — klaim perangkat lewat ID device (MOSS-…). */
export function DeviceDialog({ open, current, onClose }: DeviceDialogProps) {
  const session = useSession();
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    const raw = new FormData(event.currentTarget).get("mac_address");
    const macAddress = normalizeDeviceId(raw);

    if (!macAddress) {
      toast.error(
        `ID device harus berformat MOSS- diikuti MAC 12 hex (contoh: ${DEVICE_ID_EXAMPLE}).`,
      );
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/device/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ macAddress }),
      });
      const result = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        toast.error(result?.error ?? "Gagal mengklaim device.");
        return;
      }

      saveDeviceId(macAddress, session?.id ?? null);
      toast.success(`Device ${macAddress} siap dipakai.`);
      onClose();
    } catch {
      toast.error("Koneksi gagal. Coba lagi.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="device-dialog"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 grid place-items-center bg-forest-night/60 p-4 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 280, damping: 24 }}
            className="w-full max-w-sm rounded-3xl border border-white/20 bg-white/10 p-5 shadow-glass backdrop-blur-xl sm:p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10 text-forest-mist">
                <SignalIcon className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-base font-semibold text-forest-mist">
                  {current ? "Ganti device" : "Tambah device"}
                </h2>
                <p className="text-xs text-forest-mist/70">
                  Masukkan ID device (MOSS- + MAC) perangkatmu.
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="mt-6">
              <label className="block text-xs font-medium text-forest-mist/80">
                ID Device
                <input
                  name="mac_address"
                  defaultValue={current ?? ""}
                  placeholder={DEVICE_ID_EXAMPLE}
                  maxLength={17}
                  autoFocus
                  spellCheck={false}
                  autoComplete="off"
                  className="mt-2 w-full rounded-2xl border border-white/20 bg-forest-night/30 px-4 py-3 font-mono text-base tracking-widest text-forest-mist uppercase shadow-glass-inset outline-none placeholder:text-forest-mist/40 placeholder:tracking-normal focus:border-forest-lime sm:text-sm"
                />
              </label>
              <p className="mt-2 text-[11px] leading-5 text-forest-mist/60">
                Format: MOSS- diikuti 12 karakter hex MAC, tanpa titik dua. ID
                tercetak di Serial Monitor saat ESP32 menyala, dan perangkat
                harus sudah terhubung ke internet agar terdaftar.
              </p>

              <div className="mt-6 flex gap-2.5">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={saving}
                  className="flex-1 rounded-full border border-white/20 py-2.5 text-sm font-medium text-forest-mist shadow-glass-sm disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 rounded-full bg-forest-lime py-2.5 text-sm font-medium text-forest-night shadow-glass disabled:opacity-60"
                >
                  {saving ? "Menyambung…" : "Simpan"}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}