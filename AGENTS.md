# AGENTS.md — Mossifier

Panduan wajib untuk siapa pun (manusia/agent) yang mengerjakan repo ini.
Bahasa utama dokumentasi: **Indonesia**. Kode, tipe, dan nama file: **English**.

## 1. Stack

- **Next.js 16** (App Router), **React 19**
- **TypeScript** — semua file `.ts` / `.tsx`, strict mode aktif. Dilarang menambah `.js` / `.jsx` baru.
- **Tailwind CSS v4** — tema lewat CSS variable di `app/globals.css`, dipetakan dengan `@theme inline`.
- **motion** — satu-satunya library animasi. Import dari `motion/react`.
- **react-toastify** — satu-satunya library notifikasi. `ToastContainer` dipasang sekali di provider.
- Path alias: `@/*` → root project.

## 2. Aturan warna (PALING PENTING)

Hanya **4 warna** yang boleh dipakai, dan semuanya **CSS variable** — jangan hardcode hex lain:

| Variable CSS | Hex | Utility Tailwind | Peran |
| --- | --- | --- | --- |
| `--moss-forest` | `#204A12` | `moss-forest` | teks utama, aksen gelap, CTA |
| `--moss-leaf` | `#88BD87` | `moss-leaf` | aksen hijau sedang, chart, status |
| `--moss-mist` | `#C0DABF` | `moss-mist` | border, bayangan, surface lembut |
| `--moss-paper` | `#FFFFFF` | `moss-paper` | background netral |

Dilarang: `text-zinc-*`, `bg-slate-*`, `text-black`, `bg-white`, `#000`, warna toast default, dll.
Turunan warna **boleh** memakai opacity modifier dari 4 warna itu, mis. `text-moss-forest/60`, `bg-moss-mist/40`.
Soft UI = `rounded-3xl` + utilitas `shadow-soft`, `shadow-soft-sm`, `shadow-soft-inset` (didefinisikan sebagai CSS variable).

## 3. Aturan data sensor (Supabase Realtime)

Sumber data utama: tabel **`devices`** di Supabase PostgreSQL. Skema Prisma 8 ada di `src/prisma/contract.ts` (bukan `prisma/schema.prisma`).

- ESP32 POST JSON ke Supabase REST: `POST {NEXT_PUBLIC_SUPABASE_URL}/rest/v1/devices` dengan kolom `device_id`, `status`, `air_quality`, `co2_in`, `co2_out`, `humidity`, `brightness`, `fan_speed`. Satu baris = satu kiriman (riwayat), jadi `device_id` tidak unik.
- Client memakai `components/dashboard/use-realtime.ts`: ambil 20 baris terakhir sekali saat mount, lalu subscribe `postgres_changes` (INSERT) ke tabel `devices`. **Tidak ada polling 7,5 detik.**
- Kredensial client hanya `NEXT_PUBLIC_SUPABASE_URL` + anon/publishable key (`lib/supabase.ts`). `DATABASE_URL` hanya untuk Prisma CLI/server, jangan pernah di-import ke client.
- Semua environment variable disimpan di **`.env`** (bukan `.env.local`) — dibaca Next.js dan `prisma.config.ts` (`dotenv/config`).
- Supabase harus mengaktifkan Realtime untuk tabel `devices` (`alter publication supabase_realtime add table devices`) plus policy RLS `select`/`insert` untuk anon. Policy anon **dideklarasikan di contract** (`rlsEnabled` + `policySelect` + `policyInsert` di `src/prisma/contract.ts`), jadi jangan bikin policy manual lagi — `npx prisma db update` akan menamainya ulang dengan hash.
- `devices.id` punya default database `gen_random_uuid()`, jadi ESP32 cukup POST kolom sensor (tanpa `id`). Ini wajib; tanpa default, REST insert ditolak `400`.
- Status tanaman: `1` = Sehat, `2` = Sakit, `3` = Mati (lihat `lib/labels.ts`; teks `sehat/sakit/mati` juga diterima).
- Skema Prisma hanya dua tabel: `users` (akun login) dan `devices` (data sensor). Login/register **nyata**: password di-hash `scrypt` (`lib/auth/password.ts`), sesi disimpan di cookie HttpOnly bertanda tangan HMAC (`lib/auth/token.ts`), dan `proxy.ts` menolak `/dashboard` tanpa sesi valid. Device yang dipantau dipilih user di sidebar (disimpan di localStorage lewat `lib/device-store.ts`); tanpa device, dashboard menampilkan empty state (bukan 0).

## 4. Struktur

```
components/
  providers/toast-provider.tsx
  auth/
    login.tsx                 # form login (POST /api/auth/login)
    register.tsx              # form register (POST /api/auth/register)
    session-provider.tsx      # teruskan user dari layout server ke client
  device/
    device-provider.tsx       # context device aktif + dialog
    device-dialog.tsx         # modal tambah/ganti device_id
    no-device.tsx             # empty state kalau belum pilih device
  home/
    home.tsx                  # landing (hero, fitur, cara kerja, CTA)
  layout/
    navbar.tsx                # navbar publik (terima prop session)
    footer.tsx
  ui/skeleton.tsx             # skeleton generik (shimmer Motion, 4 warna)
  ui/loading-face.tsx         # indikator inline "O_O"
  ui/index.ts                 # barrel export: @/components/ui
  dashboard/
    sidebar.tsx               # sidebar desktop + topbar mobile (device + logout)
    mascot-physics.tsx        # bola wajah draggable (drag + constraint viewport)
    overview.tsx              # halaman dashboard utama (data terbaru)
    field-view.tsx            # halaman generik 1 kolom (termasuk status tanaman)
    air-quality-view.tsx      # kualitas udara + CO2 in/out
    use-realtime.ts           # Supabase Realtime (INSERT) per device_id
    live-status.tsx           # badge LIVE + indikator fetch
    trend-chart.tsx           # grafik garis generik 1–2 seri
    stat-card.tsx             # kartu statistik
    dashboard-skeleton.tsx    # komposisi skeleton dashboard
    icons.tsx
    motion-variants.ts
app/
  page.tsx                    # home (landing) — baca sesi untuk navbar
  login/page.tsx              # login (redirect ke /dashboard kalau sudah masuk)
  register/page.tsx           # register (idem)
  api/auth/
    register/route.ts         # buat user + set cookie sesi
    login/route.ts            # verifikasi password + set cookie sesi
    logout/route.ts           # hapus cookie sesi
    me/route.ts               # user dari cookie (debug)
  dashboard/
    layout.tsx                # guard sesi + sidebar + mascot
    page.tsx                  # overview (data terbaru)
    air-quality/page.tsx      # kualitas udara + CO2 in/out
    kelembapan/page.tsx       # humidity
    kecepatan-fan/page.tsx    # fan_speed
    kecerahan/page.tsx        # brightness
    status-tanaman/page.tsx   # status (1=Sehat, 2=Sakit, 3=Mati)
  globals.css               # 4 CSS variable + @theme inline + shadow soft
  layout.tsx                # metadata, font, ToastProvider
  robots.ts                 # SEO /robots.txt
  sitemap.ts                # SEO /sitemap.xml
lib/
  supabase.ts               # Supabase browser client (anon key)
  sensors.ts                # tipe + label + helper data sensor
  format.ts                 # format tanggal konsisten (anti hydration mismatch)
  labels.ts                 # mapping status tanaman
  device-store.ts           # device_id aktif (localStorage + useSyncExternalStore)
  auth/
    types.ts                # SessionUser
    password.ts             # hash/verify password (scrypt)
    token.ts                # buat/baca token cookie (HMAC, murni)
    session.ts              # getSession/setSessionCookie/clearSessionCookie
    users.ts                # query tabel users (Prisma 8)
proxy.ts                    # gate /dashboard ↔ /login & /register
esp32_upgrade.ino           # firmware ESP32 → POST /rest/v1/devices (URL + anon key dari .env)
public/                     # aset statis (favicon, gambar, dll.)
```

## 5. SEO

- `app/robots.ts` → `/robots.txt`: allow semua, disallow `/api/`, sitemap dari env.
- `app/sitemap.ts` + metadata di `app/layout.tsx` memakai `NEXT_PUBLIC_SITE_URL`.

## 6. Perintah

```bash
npm run dev         # development (Turbopack — default Next 16)
npm run build       # build produksi (Turbopack)
npm run lint        # eslint
```

Prisma 8 (baca `.env`):

```bash
npx prisma contract emit   # regenerate contract.json + contract.d.ts
npx prisma db update       # terapkan perubahan contract ke database
npx prisma db verify       # cek DB cocok dengan contract
```

Catatan: Tailwind v4 di-build lewat `next.config.ts` → `turbopack.rules` +
`@tailwindcss/turbopack`. `postcss.config.mjs` tetap disimpan sebagai fallback;
jangan hapus.

## 7. Alur kerja

Sebelum mengubah UI, cek apakah perubahan masih memakai 4 warna + Motion + react-toastify.
Semua loading state **wajib** memakai primitives di `components/ui/skeleton.tsx`
(`Skeleton`, `SkeletonText`, `SkeletonCard`, `SkeletonStatCard`, `SkeletonChart`, dll.)
lewat `import { ... } from "@/components/ui"` — jangan membuat skeleton inline baru.
Setiap selesai fitur, jalankan `npm run build` dan pastikan tidak ada error tipe.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- BEGIN:nextjs-agent-feedback -->

## Report Next.js feedback

The project owner enabled `experimental.agentFeedback`, authorizing this feedback pass. When enabled, `next dev` writes this block and restores it if removed. Commit `AGENTS.md` with your work to keep the tree clean.

During the current user request, retain anonymized facts as feedback candidates for meaningful or recurring Next.js issues:

- Crashes, hangs, OOMs, or unexpected slowness
- Incorrect behavior, output, errors, or diagnostics
- Missing, unclear, or conflicting documentation
- Unexpected CLI, codemod, Skill, or upgrade behavior and non-obvious workarounds

Continue the current user request without reporting immediately. Routine debugging is not feedback. Verify changes before retaining them as feedback candidates. Never retain code, logs, paths, URLs, secrets, personal information, or project-specific data.

Retain qualifying friction even if it is later fixed or worked around; record the final outcome during the reporting pass.

Before the final response, run one reporting pass. If candidates remain, from this file's directory run `npx --no-install next internal agent-feedback-instructions` once without piping or truncating its output. Follow its output or error guidance. If a network sandbox blocks it, retry with network access; if it still returns no output, continue normally.

<!-- END:nextjs-agent-feedback -->
