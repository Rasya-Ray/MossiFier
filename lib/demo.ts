/**
 * Mode demo untuk juri/presentasi.
 *
 * Satu tombol di /login dan /register memanggil `POST /api/auth/demo`, yang
 * membuat sesi bertanda tangan tanpa menyentuh database (jadi tetap jalan
 * walau DB sedang lambat). Device demo otomatis dipakai oleh `DeviceProvider`
 * sehingga user tidak perlu mengisi MAC address.
 *
 * Identitas device sekarang MAC address 12 hex (contoh: B0A7322B0960),
 * bukan lagi string MOSS-XXXXXX.
 */

/** ID sesi khusus demo — dipakai untuk mendeteksi mode demo di client. */
export const DEMO_USER_ID = "demo-juri";

export const DEMO_EMAIL = "demo@mossifier.app";
export const DEMO_NAME = "Mode Demo (Juri)";

/** MAC address ESP32 unit pameran. */
export const DEMO_DEVICE_MAC = "B0A7322B0960";

/** Device yang langsung ditampilkan untuk akun tanpa pilihan device tersimpan. */
export const DEFAULT_DEVICE_MAC =
  process.env.NEXT_PUBLIC_DEFAULT_DEVICE_MAC?.trim() || DEMO_DEVICE_MAC;

/** True kalau sesi ini adalah sesi demo (bukan akun asli di tabel users). */
export function isDemoUser(
  user: { id: string } | null | undefined,
): boolean {
  return user?.id === DEMO_USER_ID;
}