"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { containerVariants, itemVariants } from "@/components/dashboard/motion-variants";
import {
  ArrowRightIcon,
  DropletIcon,
  SignalIcon,
  SproutIcon,
  SunIcon,
  WindIcon,
  LeafIcon,
} from "@/components/dashboard/icons";

const FEATURES = [
  {
    icon: SignalIcon,
    title: "Air Quality In & Out",
    text: "Kualitas udara dalam dan luar ruangan dalam satu tampilan.",
  },
  {
    icon: DropletIcon,
    title: "Kelembapan",
    text: "Cek kelembapan udara di sekitar tanaman kapan saja.",
  },
  {
    icon: WindIcon,
    title: "Kecepatan Fan",
    text: "Pantau sirkulasi udara yang menjaga tanaman tetap segar.",
  },
  {
    icon: SunIcon,
    title: "Kecerahan LED",
    text: "Tingkat cahaya untuk fotosintesis, terpantau real-time.",
  },
  {
    icon: SproutIcon,
    title: "Status Tanaman",
    text: "Sehat, sakit, atau mati — langsung ketahuan dari datanya.",
  },
  {
    icon: LeafIcon,
    title: "Data realtime",
    text: "Semua pembacaan langsung masuk dari perangkat ke Supabase.",
  },
];

const STEPS = [
  {
    step: "01",
    title: "Sensor bekerja",
    text: "Perangkat IoT membaca kondisi lingkungan tanamanmu.",
  },
  {
    step: "02",
    title: "Masuk ke Supabase",
    text: "Data dikirim ke database dan langsung disiarkan ke dashboard.",
  },
  {
    step: "03",
    title: "Dashboard menampilkan",
    text: "Buka dashboard, lihat grafik dan status terbaru dalam hitungan detik.",
  },
];

export function Home() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-moss-mist/50 blur-3xl" />
        <motion.div
          initial="hidden"
          animate="show"
          variants={containerVariants}
          className="mx-auto w-full max-w-6xl px-5 pt-16 pb-20 text-center sm:px-8 sm:pt-24"
        >
          <motion.span
            variants={itemVariants}
            className="inline-flex items-center gap-2 rounded-full border border-moss-mist bg-moss-paper px-4 py-2 text-xs font-medium text-moss-forest/70 shadow-soft-sm"
          >
            <span className="h-2 w-2 rounded-full bg-moss-leaf" />
            IoT · Real-time · Supabase
          </motion.span>

          <motion.h1
            variants={itemVariants}
            className="mx-auto mt-6 max-w-3xl text-4xl font-semibold leading-tight tracking-tight text-moss-forest sm:text-5xl"
          >
            Pantau tanamanmu{" "}
            <span className="text-moss-leaf">kayak scroll medsos.</span>
          </motion.h1>

          <motion.p
            variants={itemVariants}
            className="mx-auto mt-5 max-w-xl text-sm leading-7 text-moss-forest/60 sm:text-base"
          >
            Mossifier mengubah data sensor jadi dashboard yang gampang dibaca.
            Udara, kelembapan, cahaya, sampai kondisi tanaman — semua dalam satu
            layar.
          </motion.p>

          <motion.div
            variants={itemVariants}
            className="mt-8 flex flex-wrap items-center justify-center gap-3"
          >
            <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}>
              <Link
                href="/register"
                className="flex items-center gap-2 rounded-full bg-moss-forest px-6 py-3 text-sm font-medium text-moss-paper shadow-soft"
              >
                Mulai sekarang
                <ArrowRightIcon className="h-4 w-4" />
              </Link>
            </motion.div>
            <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}>
              <Link
                href="/login"
                className="rounded-full border border-moss-mist px-6 py-3 text-sm font-medium text-moss-forest shadow-soft-sm"
              >
                Masuk
              </Link>
            </motion.div>
          </motion.div>
        </motion.div>
      </section>

      {/* Fitur */}
      <section id="fitur" className="scroll-mt-24">
        <div className="mx-auto w-full max-w-6xl px-5 pb-20 sm:px-8">
          <div className="mb-10 text-center">
            <p className="text-xs font-medium tracking-[0.2em] text-moss-forest/60 uppercase">
              Fitur
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-moss-forest sm:text-3xl">
              Enam sensor, satu dashboard
            </h2>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <motion.article
                key={feature.title}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                whileHover={{ y: -6 }}
                className="rounded-3xl border border-moss-mist/70 bg-moss-paper p-6 shadow-soft"
              >
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-moss-mist/40 text-moss-forest">
                  <feature.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 text-base font-semibold text-moss-forest">
                  {feature.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-moss-forest/60">
                  {feature.text}
                </p>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      {/* Cara kerja */}
      <section id="cara-kerja" className="scroll-mt-24">
        <div className="mx-auto w-full max-w-6xl px-5 pb-20 sm:px-8">
          <div className="rounded-[2rem] border border-moss-mist/70 bg-linear-to-br from-moss-mist/60 via-moss-paper to-moss-paper p-7 shadow-soft sm:p-10">
            <p className="text-xs font-medium tracking-[0.2em] text-moss-forest/60 uppercase">
              Cara kerja
            </p>
            <h2 className="mt-2 max-w-lg text-2xl font-semibold text-moss-forest sm:text-3xl">
              Dari sensor ke layar, tiga langkah.
            </h2>

            <div className="mt-8 grid gap-5 sm:grid-cols-3">
              {STEPS.map((item) => (
                <motion.div
                  key={item.step}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.3 }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                  className="rounded-3xl bg-moss-paper p-5 shadow-soft-sm"
                >
                  <p className="text-sm font-semibold text-moss-leaf">
                    {item.step}
                  </p>
                  <h3 className="mt-2 text-base font-semibold text-moss-forest">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-moss-forest/60">
                    {item.text}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section id="mulai" className="scroll-mt-24">
        <div className="mx-auto w-full max-w-6xl px-5 pb-24 sm:px-8">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="flex flex-col items-center gap-5 rounded-[2rem] bg-moss-forest p-10 text-center text-moss-paper shadow-soft"
          >
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-moss-paper text-moss-forest">
              <SproutIcon className="h-5 w-5" />
            </span>
            <h2 className="max-w-lg text-2xl font-semibold sm:text-3xl">
              Tanamanmu nggak bisa ngomong. Tapi datanya bisa.
            </h2>
            <p className="max-w-md text-sm text-moss-paper/70">
              Daftar gratis (sementara pakai dummy login), terus langsung masuk
              ke dashboard.
            </p>
            <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}>
              <Link
                href="/register"
                className="flex items-center gap-2 rounded-full bg-moss-paper px-6 py-3 text-sm font-medium text-moss-forest"
              >
                Daftar sekarang
                <ArrowRightIcon className="h-4 w-4" />
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </section>
    </>
  );
}
