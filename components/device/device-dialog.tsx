"use client";

import { AnimatePresence, motion } from "motion/react";
import { toast } from "react-toastify";
import { saveDeviceId } from "@/lib/device-store";
import { SignalIcon } from "@/components/dashboard/icons";

type DeviceDialogProps = {
  open: boolean;
  current: string | null;
  onClose: () => void;
};

/** Modal "Tambah / Ganti device" — device ID yang dipakai ESP32. */
export function DeviceDialog({ open, current, onClose }: DeviceDialogProps) {
  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const raw = new FormData(event.currentTarget).get("device_id");
    const deviceId = typeof raw === "string" ? raw.trim() : "";

    if (!deviceId) {
      toast.error("Device ID wajib diisi (contoh: MOSS-ESP32-001).");
      return;
    }

    saveDeviceId(deviceId);
    toast.success(`Device ${deviceId} dipakai.`);
    onClose();
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
            className="w-full max-w-sm rounded-3xl border border-white/20 bg-white/10 backdrop-blur-xl p-6 shadow-glass"
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
                  Masukkan ID perangkat ESP32.
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="mt-6">
              <label className="block text-xs font-medium text-forest-mist/80">
                Device ID
                <input
                  name="device_id"
                  defaultValue={current ?? ""}
                  placeholder="MOSS-ESP32-001"
                  autoFocus
                  className="mt-2 w-full rounded-2xl border border-white/20 bg-forest-night/30 px-4 py-3 text-sm text-forest-mist shadow-glass-inset outline-none placeholder:text-forest-mist/50 focus:border-forest-lime"
                />
              </label>

              <div className="mt-6 flex gap-2.5">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 rounded-full border border-white/20 py-2.5 text-sm font-medium text-forest-mist shadow-glass-sm"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-full bg-forest-lime py-2.5 text-sm font-medium text-forest-night shadow-glass"
                >
                  Simpan
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
