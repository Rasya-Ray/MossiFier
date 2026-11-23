/**
 * Format ID device Mossifier: `MOSS-` + MAC address 12 hex huruf besar,
 * tanpa titik dua. Contoh: MOSS-B0A7322B0960.
 *
 * File ini murni (tanpa import server) supaya dipakai bersama oleh client
 * (dialog device), server (API) dan test. Hanya format penuh yang diterima:
 * MAC polos tanpa prefix `MOSS-` ditolak.
 */

export const DEVICE_ID_PREFIX = "MOSS-";

/** MOSS-B0A7322B0960 */
export const DEVICE_ID_PATTERN = /^MOSS-[0-9A-F]{12}$/;

export const DEVICE_ID_EXAMPLE = "MOSS-B0A7322B0960";

/** Trim + huruf besar, lalu cek format. Mengembalikan null kalau tidak valid. */
export function normalizeDeviceId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim().toUpperCase();
  return DEVICE_ID_PATTERN.test(id) ? id : null;
}

/** Bangun ID dari MAC (boleh pakai ":" / "-"), mis. dari env lama. */
export function deviceIdFromMac(mac: string): string | null {
  const hex = mac.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
  return hex.length === 12 ? `${DEVICE_ID_PREFIX}${hex}` : null;
}
