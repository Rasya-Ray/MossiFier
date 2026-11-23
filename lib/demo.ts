/**
 * Mode demo untuk juri/presentasi.
 *
 * Satu tombol di /login dan /register memanggil `POST /api/auth/demo`, yang
 * membuat sesi bertanda tangan tanpa menyentuh database (jadi tetap jalan
 * walau DB sedang lambat). Device demo otomatis dipakai oleh `DeviceProvider`
 * sehingga user tidak perlu mengisi MAC address.
 *
 * Identitas device = `MOSS-` + MAC address 12 hex (lib/device-id.ts),
 * contoh MOSS-B0A7322B0960.
 */

import { deviceIdFromMac, normalizeDeviceId } from "@/lib/device-id";

/** ID sesi khusus demo — dipakai untuk mendeteksi mode demo di client. */
export const DEMO_USER_ID = "demo-juri";

export const DEMO_EMAIL = "demo@mossifier.app";
export const DEMO_NAME = "Mode Demo (Juri)";

/** ID device ESP32 unit pameran (MOSS- + MAC). */
export const DEMO_DEVICE_ID = "MOSS-B0A7322B0960";

const envDefault = process.env.NEXT_PUBLIC_DEFAULT_DEVICE_ID?.trim();

/**
 * Device yang langsung ditampilkan untuk akun tanpa pilihan device tersimpan.
 * Env harus berformat MOSS-XXXXXXXXXXXX; MAC polos dari env lama otomatis
 * diberi prefix. Nilai tidak valid → pakai device demo.
 */
export const DEFAULT_DEVICE_ID =
  normalizeDeviceId(envDefault) ??
  (envDefault ? deviceIdFromMac(envDefault) : null) ??
  DEMO_DEVICE_ID;

/** True kalau sesi ini adalah sesi demo (bukan akun asli di tabel users). */
export function isDemoUser(
  user: { id: string } | null | undefined,
): boolean {
  return user?.id === DEMO_USER_ID;
}