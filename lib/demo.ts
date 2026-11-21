/**
 * Mode demo untuk juri/presentasi.
 *
 * Satu tombol di /login dan /register memanggil `POST /api/auth/demo`, yang
 * membuat sesi bertanda tangan tanpa menyentuh database (jadi tetap jalan
 * walau DB sedang lambat). Device demo otomatis dipakai oleh `DeviceProvider`
 * sehingga user tidak perlu mengisi Device ID.
 */

/** ID sesi khusus demo — dipakai untuk mendeteksi mode demo di client. */
export const DEMO_USER_ID = "demo-juri";

export const DEMO_EMAIL = "demo@mossifier.app";
export const DEMO_NAME = "Mode Demo (Juri)";

/** MAC address ESP32 unit pameran: MOSS-B0A7322B0960. */
export const DEMO_DEVICE_ID = "MOSS-B0A7322B0960";

/** True kalau sesi ini adalah sesi demo (bukan akun asli di tabel users). */
export function isDemoUser(
  user: { id: string } | null | undefined,
): boolean {
  return user?.id === DEMO_USER_ID;
}
