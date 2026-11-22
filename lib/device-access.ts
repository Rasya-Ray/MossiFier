/**
 * Helper akses device (server-only).
 *
 * Identitas device = MAC address 12 hex huruf besar. `devices.id` (integer)
 * hanya dipakai internal untuk query ke `sensor_readings`.
 *
 * Semua endpoint membaca data lewat service_role karena RLS aktif tanpa
 * policy anon. Helper ini memastikan user tidak bisa membaca/memodifikasi
 * data device milik user lain hanya dengan menebak MAC address.
 */

import type { SessionUser } from "@/lib/auth/types";
import { DEFAULT_DEVICE_MAC, DEMO_DEVICE_MAC, isDemoUser } from "@/lib/demo";
import { getAdminClient } from "@/lib/supabase-admin";

/** MAC 12 hex tanpa pemisah, mis. B0A7322B0960. */
export const MAC_PATTERN = /^[0-9A-F]{12}$/;

export function normalizeMac(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const mac = value.trim().toUpperCase();
  return MAC_PATTERN.test(mac) ? mac : null;
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
 * Sesi demo memakai perangkat pameran bersama. Device ini sengaja tidak
 * di-claim ke user (id `demo-juri` bukan UUID), tapi harus tetap bisa dibaca
 * supaya tombol demo selalu berfungsi.
 */
function isShowcaseMac(mac: string, user: SessionUser): boolean {
  return (
    isDemoUser(user) &&
    (mac === DEMO_DEVICE_MAC || mac === DEFAULT_DEVICE_MAC)
  );
}

function canAccess(ownerId: string | null, user: SessionUser, mac: string): boolean {
  if (!ownerId || ownerId === user.id) return true;
  return isShowcaseMac(mac, user);
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
  rawMac: unknown,
  user: SessionUser,
): Promise<DeviceLookup> {
  const mac = normalizeMac(rawMac);
  if (!mac) {
    return { ok: false, status: 400, error: "MAC address tidak valid (12 hex)." };
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
    console.error("[device-access] gagal mencari MAC:", error.message);
    return { ok: false, status: 503, error: "Database belum bisa diakses." };
  }
  if (!data) {
    return { ok: false, status: 404, error: "Device dengan MAC ini tidak ditemukan." };
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
