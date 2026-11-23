import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { findDeviceForUser } from "@/lib/device-access";
import { DEFAULT_DEVICE_ID, isDemoUser } from "@/lib/demo";
import { getAdminClient } from "@/lib/supabase-admin";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/** GET /api/device/list — perangkat milik user yang sedang login. */
export async function GET() {
  const user = await getSession();
  if (!user) return jsonError("Silakan masuk dulu.", 401);

  // Sesi demo tidak punya baris di tabel users, jadi tampilkan perangkat
  // pameran saja (jika sudah terdaftar lewat register_device).
  if (isDemoUser(user)) {
    const access = await findDeviceForUser(DEFAULT_DEVICE_ID, user);
    const devices = access.ok
      ? [
          {
            macAddress: access.device.macAddress,
            name: access.device.name,
            claimedAt: null,
          },
        ]
      : [];
    return NextResponse.json({ ok: true, devices });
  }

  const { data, error } = await getAdminClient()
    .from("devices")
    .select("id, mac_address, name, claimed_at")
    .eq("user_id", user.id)
    .order("claimed_at", { ascending: false });

  if (error) {
    console.error("[device/list]", error.message);
    return jsonError("Gagal memuat daftar device.", 500);
  }

  const devices = (data ?? []).map((d: Record<string, unknown>) => ({
    macAddress: d.mac_address,
    name: typeof d.name === "string" ? d.name : null,
    claimedAt: d.claimed_at ?? null,
  }));

  return NextResponse.json({ ok: true, devices });
}
