"use client";

import { motion } from "motion/react";
import { useDevice } from "@/components/device/device-provider";
import { SignalIcon } from "@/components/dashboard/icons";

type NoDeviceProps = {
  title?: string;
};

/** Empty state saat user belum memilih device — bukan menampilkan angka 0. */
export function NoDevice({ title = "Belum ada device" }: NoDeviceProps) {
  const { openDialog } = useDevice();

  return (
    <motion.main
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="mx-auto w-full max-w-xl px-4 py-12 sm:px-8 sm:py-16"
    >
      <section className="rounded-[2rem] border border-white/20 bg-linear-to-br from-white/20 via-white/10 to-white/5 p-8 text-center shadow-glass">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-white/10 backdrop-blur-xl text-forest-mist shadow-glass-sm">
          <SignalIcon className="h-6 w-6" />
        </span>
        <h1 className="mt-5 text-xl font-semibold text-forest-mist">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-forest-mist/70">
          Tambahkan Device ID perangkat ESP32 terlebih dahulu. Tanpa perangkat,
          dashboard tidak akan menampilkan data.
        </p>
        <button
          type="button"
          onClick={openDialog}
          className="mt-6 rounded-full bg-forest-lime px-6 py-3 text-sm font-medium text-forest-night shadow-glass"
        >
          Tambah Device
        </button>
      </section>
    </motion.main>
  );
}
