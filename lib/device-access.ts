/**
 * Helper akses device (server-only).
 *
 * Identitas device = `MOSS-` + MAC 12 hex huruf besar (lib/device-id.ts),
 * disimpan utuh di kolom `devices.mac_address`. `devices.id` (integer) hanya
 * dipakai internal untuk query ke `sensor_readings`.
 *
 * Semua endpoint membaca data lewat service_role karena RLS aktif tanpa
 * policy anon. Helper ini memastikan user tidak bisa membaca/memodifikasi
 * data device milik user lain hanya dengan menebak MAC address.
 */

import type { SessionUser } from "@/lib/auth/types";
import { DEFAULT_DEVICE_ID, DEMO_DEVICE_ID, isDemoUser } from "@/lib/demo";
import { DEVICE_ID_EXAMPLE, normalizeDeviceId } from "@/lib/device-id";
import { getAdminClient } from "@/lib/supabase-admin";

export { normalizeDeviceId };

/** True untuk device pameran yang boleh dipakai semua akun. */
export function isShowcaseDevice(deviceId: string): boolean {
  return deviceId === DEMO_DEVICE_ID || deviceId === DEFAULT_DEVICE_ID;
}

export type AccessibleDevice = {
  /** id integer internal — jangan dikirim ke client. */
  id: number;
  macAddress: string;
  name: string | null;
  ownerId: string | null;
};

export type DeviceLookup =
  | { ok: true; device: AccessibleDevice }
  | { ok: false; status: 400 | 403 | 404 | 503; error: string };

/**
 * Aturan akses:
 * - Akun demo boleh membaca device apa pun, walau sudah diklaim akun lain.
 *   Demo tidak pernah mengklaim (id `demo-juri` bukan UUID), jadi tidak bisa
 *   mengunci atau mengganggu pemilik asli.
 * - Device pameran (demo/default) boleh dipakai semua akun.
 * - Selain itu hanya pemilik, atau siapa pun selama device belum diklaim.
 */
function canAccess(
  ownerId: string | null,
  user: SessionUser,
  deviceId: string,
): boolean {
  if (isDemoUser(user)) return true;
  if (!ownerId || ownerId === user.id) return true;
  return isShowcaseDevice(deviceId);
}

function toAccessibleDevice(row: Record<string, unknown>): AccessibleDevice | null {
  const id = Number(row.id);
  if (!Number.isInteger(id) || id <= 0) return null;
  return {
    id,
    macAddress: String(row.mac_address ?? ""),
    name: typeof row.name === "string" ? row.name : null,
    ownerId: typeof row.user_id === "string" ? row.user_id : null,
  };
}

/** Cari device berdasarkan MAC dan pastikan user boleh mengaksesnya. */
export async function findDeviceForUser(
  rawId: unknown,
  user: SessionUser,
): Promise<DeviceLookup> {
  const mac = normalizeDeviceId(rawId);
  if (!mac) {
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
    .select("id, mac_address, user_id, name")
    .eq("mac_address", mac)
    .maybeSingle();

  if (error) {
    console.error("[device-access] gagal mencari ID device:", error.message);
    return { ok: false, status: 503, error: "Database belum bisa diakses." };
  }
  if (!data) {
    return { ok: false, status: 404, error: "Device dengan ID ini belum terdaftar. Pastikan ESP32 sudah menyala dan terhubung ke internet." };
  }

  const device = toAccessibleDevice(data as Record<string, unknown>);
  if (!device) {
    return { ok: false, status: 503, error: "Data device tidak valid." };
  }
  if (!canAccess(device.ownerId, user, mac)) {
    return { ok: false, status: 403, error: "Device ini milik pengguna lain." };
  }

  return { ok: true, device };
}

/** Varian untuk endpoint yang sudah menerima `device_id` integer (internal). */
export async function findDeviceByIdForUser(
  deviceId: number,
  user: SessionUser,
): Promise<DeviceLookup> {
  if (!Number.isInteger(deviceId) || deviceId <= 0) {
    return { ok: false, status: 400, error: "Device tidak valid." };
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
    .select("id, mac_address, user_id, name")
    .eq("id", deviceId)
    .maybeSingle();

  if (error) {
    console.error("[device-access] gagal mencari id:", error.message);
    return { ok: false, status: 503, error: "Database belum bisa diakses." };
  }
  if (!data) {
    return { ok: false, status: 404, error: "Device tidak ditemukan." };
  }

  const device = toAccessibleDevice(data as Record<string, unknown>);
  if (!device) {
    return { ok: false, status: 503, error: "Data device tidak valid." };
  }
  if (!canAccess(device.ownerId, user, device.macAddress)) {
    return { ok: false, status: 403, error: "Device ini milik pengguna lain." };
  }

  return { ok: true, device };
}
