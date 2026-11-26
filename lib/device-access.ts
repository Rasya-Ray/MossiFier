/**
 * Akses device (server-only).
 *
 * Skema baru: tabel `devices` murni data sensor per kiriman ESP32,
 * tanpa FK/owner/nama/klaim. Validasi cukup memastikan `device_id`
 * (format MOSS-…) sudah terdaftar di tabel — kalau belum ada baris,
 * ID dianggap invalid (belum pernah kirim data).
 */

import { getAdminClient } from "@/lib/supabase-admin";
import { DEVICE_ID_EXAMPLE, normalizeDeviceId } from "@/lib/device-id";

export { normalizeDeviceId };

export type AccessibleDevice = {
  deviceId: string;
};

export type DeviceLookup =
  | { ok: true; device: AccessibleDevice }
  | { ok: false; status: 400 | 404 | 503; error: string };

/** Cari device berdasarkan device_id dan pastikan ID valid (ada di DB). */
export async function findDeviceForUser(
  rawId: unknown,
  _user: unknown,
): Promise<DeviceLookup> {
  const deviceId = normalizeDeviceId(rawId);
  if (!deviceId) {
    return {
      ok: false,
      status: 400,
      error: `ID device tidak valid. Formatnya MOSS- diikuti MAC 12 hex, contoh ${DEVICE_ID_EXAMPLE}.`,
    };
  }

  let supabase;
  try {
    supabase = getAdminClient();
  } catch {
    return {
      ok: false,
      status: 503,
      error: "Koneksi database belum dikonfigurasi.",
    };
  }

  const { data, error } = await supabase
    .from("devices")
    .select("device_id")
    .eq("device_id", deviceId)
    .limit(1);

  if (error) {
    console.error("[device-access] gagal mencari ID device:", error.message);
    return { ok: false, status: 503, error: "Database belum bisa diakses." };
  }

  const row = data?.[0];
  if (!row) {
    return {
      ok: false,
      status: 404,
      error: "Device dengan ID ini belum terdaftar. Pastikan ESP32 sudah menyala dan mengirim data.",
    };
  }

  return { ok: true, device: { deviceId: row.device_id } };
}
