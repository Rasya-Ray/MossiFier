"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { containerVariants, itemVariants } from "@/components/dashboard/motion-variants";
import { DemoButton } from "@/components/auth/demo-button";
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
    text: "Bandingkan kualitas udara dan CO₂ di dalam dan luar ruangan, sekaligus.",
  },
  {
    icon: DropletIcon,
    title: "Kelembapan",
    text: "Pastikan lumutmu tidak kekeringan — kelembapan terpantau setiap saat.",
  },
  {
    icon: WindIcon,
    title: "Kecepatan Fan",
    text: "Lihat seberapa kencang kipas mengalirkan udara melewati lumut.",
  },
  {
    icon: SunIcon,
    title: "Kecerahan LED",
    text: "Pantau cahaya lampu tumbuh yang dipakai lumut untuk berfotosintesis.",
  },
  {
    icon: SproutIcon,
    title: "Status Tanaman",
    text: "Sehat, sakit, atau mati — langsung terlihat dari hasil pantauan perangkat.",
  },
  {
    icon: LeafIcon,
    title: "Data realtime",
    text: "Data baru dari perangkat muncul di layar seketika, tanpa perlu refresh.",
  },
];

const STEPS = [
  {
    step: "01",
    title: "Sensor membaca",
    text: "ESP32 di Mossifier mengukur udara, kelembapan, dan cahaya di sekitar lumut.",
  },
  {
    step: "02",
    title: "Data dikirim ke cloud",
    text: "Hasil pengukuran tersimpan di database dan langsung diteruskan ke dashboard.",
  },
  {
    step: "03",
    title: "Kamu tinggal melihat",
    text: "Buka dashboard untuk melihat grafik, status lumut, dan saran dari Kibo.",
  },
];

export function Home() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
                <motion.div
          initial="hidden"
          animate="show"
          variants={containerVariants}
          className="mx-auto w-full max-w-6xl px-4 pt-14 pb-20 text-center sm:px-8 sm:pt-24 sm:pb-24"
        >
          <motion.span
            variants={itemVariants}
            className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 backdrop-blur-xl px-4 py-2 text-xs font-medium text-forest-mist/80 shadow-glass-sm"
          >
            <span className="h-2 w-2 rounded-full bg-forest-lime" />
            Penjaga udara berbasis lumut
          </motion.span>

          <motion.h1
            variants={itemVariants}
            className="mx-auto mt-6 max-w-3xl text-3xl font-semibold leading-tight tracking-tight text-forest-mist sm:text-4xl lg:text-5xl"
          >
            Lumut sehat, udara segar,{" "}
            <span className="text-forest-lime">semuanya terpantau.</span>
          </motion.h1>

          <motion.p
            variants={itemVariants}
            className="mx-auto mt-5 max-w-xl text-sm leading-7 text-forest-mist/70 sm:text-base"
          >
            Mossifier membaca sensor di sekitar lumutmu — kualitas udara, CO₂,
            kelembapan, dan cahaya — lalu menampilkannya dalam dashboard yang
            mudah dipahami. Ada Kibo juga untuk membantu menjelaskan angkanya.
          </motion.p>

          <motion.div
            variants={itemVariants}
            className="mt-8 flex flex-wrap items-center justify-center gap-3"
          >
            <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}>
              <Link
                href="/register"
                className="flex items-center gap-2 rounded-full bg-forest-lime px-6 py-3 text-sm font-medium text-forest-night shadow-glass"
              >
                Mulai sekarang
                <ArrowRightIcon className="h-4 w-4" />
              </Link>
            </motion.div>
            <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}>
              <Link
                href="/login"
                className="rounded-full border border-white/20 px-6 py-3 text-sm font-medium text-forest-mist shadow-glass-sm"
              >
                Masuk
              </Link>
            </motion.div>
          </motion.div>
          <motion.div
            variants={itemVariants}
            className="mx-auto mt-3 w-full max-w-xs"
          >
            <DemoButton />
          </motion.div>
        </motion.div>
      </section>

      {/* Fitur */}
      <section id="fitur" className="scroll-mt-24">
        <div className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-8 sm:pb-20">
          <div className="mb-8 text-center sm:mb-10">
            <p className="text-xs font-medium tracking-[0.2em] text-forest-mist/70 uppercase">
              Fitur
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-forest-mist sm:text-3xl">
              Satu dashboard untuk semua kabar lumutmu
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
                className="rounded-3xl border border-white/20 bg-white/10 backdrop-blur-xl p-6 shadow-glass"
              >
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10 text-forest-mist">
                  <feature.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 text-base font-semibold text-forest-mist">
                  {feature.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-forest-mist/70">
                  {feature.text}
                </p>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      {/* Cara kerja */}
      <section id="cara-kerja" className="scroll-mt-24">
        <div className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-8 sm:pb-20">
          <div className="rounded-[2rem] border border-white/20 bg-linear-to-br from-white/20 via-white/10 to-white/5 p-5 shadow-glass sm:p-10">
            <p className="text-xs font-medium tracking-[0.2em] text-forest-mist/70 uppercase">
              Cara kerja
            </p>
            <h2 className="mt-2 max-w-lg text-2xl font-semibold text-forest-mist sm:text-3xl">
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
                  className="rounded-3xl bg-white/10 backdrop-blur-xl p-5 shadow-glass-sm"
                >
                  <p className="text-sm font-semibold text-forest-lime">
                    {item.step}
                  </p>
                  <h3 className="mt-2 text-base font-semibold text-forest-mist">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-forest-mist/70">
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
        <div className="mx-auto w-full max-w-6xl px-4 pb-20 sm:px-8 sm:pb-24">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="flex flex-col items-center gap-5 rounded-[2rem] border border-forest-lime/30 bg-forest-pine/40 p-6 text-center text-forest-mist shadow-glass backdrop-blur-2xl sm:p-10"
          >
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-forest-lime text-forest-night">
              <SproutIcon className="h-5 w-5" />
            </span>
            <h2 className="max-w-lg text-2xl font-semibold sm:text-3xl">
              Tanaman tidak bisa berbicara, tetapi datanya bisa.
            </h2>
            <p className="max-w-md text-sm text-forest-mist/70">
              Buat akun, masukkan ID perangkatmu, lalu mulai pantau lumutmu.
            </p>
            <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}>
              <Link
                href="/register"
                className="flex items-center gap-2 rounded-full bg-forest-lime px-6 py-3 text-sm font-medium text-forest-night"
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
