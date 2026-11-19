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
          className="fixed inset-0 z-50 grid place-items-center bg-moss-forest/25 p-4 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 280, damping: 24 }}
            className="w-full max-w-sm rounded-3xl border border-moss-mist/70 bg-moss-paper p-6 shadow-soft"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-moss-mist/50 text-moss-forest">
                <SignalIcon className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-base font-semibold text-moss-forest">
                  {current ? "Ganti device" : "Tambah device"}
                </h2>
                <p className="text-xs text-moss-forest/60">
                  Masukkan ID perangkat ESP32.
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="mt-6">
              <label className="block text-xs font-medium text-moss-forest/70">
                Device ID
                <input
                  name="device_id"
                  defaultValue={current ?? ""}
                  placeholder="MOSS-ESP32-001"
                  autoFocus
                  className="mt-2 w-full rounded-2xl border border-moss-mist bg-moss-mist/25 px-4 py-3 text-sm text-moss-forest shadow-soft-inset outline-none placeholder:text-moss-forest/40 focus:border-moss-leaf"
                />
              </label>

              <div className="mt-6 flex gap-2.5">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 rounded-full border border-moss-mist py-2.5 text-sm font-medium text-moss-forest shadow-soft-sm"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-full bg-moss-forest py-2.5 text-sm font-medium text-moss-paper shadow-soft"
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
