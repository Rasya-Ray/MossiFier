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
      className="mx-auto w-full max-w-xl px-5 py-16 sm:px-8"
    >
      <section className="rounded-[2rem] border border-moss-mist/70 bg-linear-to-br from-moss-mist/60 via-moss-paper to-moss-paper p-8 text-center shadow-soft">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-moss-paper text-moss-forest shadow-soft-sm">
          <SignalIcon className="h-6 w-6" />
        </span>
        <h1 className="mt-5 text-xl font-semibold text-moss-forest">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-moss-forest/60">
          Tambahkan Device ID perangkat ESP32 dulu. Tanpa device, dashboard
          tidak menampilkan data apa pun.
        </p>
        <button
          type="button"
          onClick={openDialog}
          className="mt-6 rounded-full bg-moss-forest px-6 py-3 text-sm font-medium text-moss-paper shadow-soft"
        >
          Tambah Device
        </button>
      </section>
    </motion.main>
  );
}
