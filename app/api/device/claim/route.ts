import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { findDeviceForUser } from "@/lib/device-access";
import { isDemoUser } from "@/lib/demo";
import { getAdminClient } from "@/lib/supabase-admin";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * POST /api/device/claim — { macAddress: "B0A7322B0960" }
 *
 * Klaim device yang sudah mendaftar lewat RPC register_device.
 * Idempotent: MAC yang sudah jadi milik user yang sama tetap 200.
 */
export async function POST(request: Request) {
  const user = await getSession();
  if (!user) return jsonError("Silakan masuk dulu.", 401);

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const access = await findDeviceForUser(body?.macAddress, user);
  if (!access.ok) return jsonError(access.error, access.status);

  const { device } = access;

  // Sesi demo memakai perangkat pameran bersama — jangan menulis user_id
  // (id "demo-juri" bukan UUID dan akan melanggar FK).
  if (isDemoUser(user)) {
    return NextResponse.json({
      ok: true,
      device: { macAddress: device.macAddress, claimed: false, demo: true },
    });
  }

  if (device.ownerId === user.id) {
    return NextResponse.json({
      ok: true,
      device: {
        macAddress: device.macAddress,
        claimed: true,
        alreadyClaimed: true,
      },
    });
  }

  if (device.ownerId) {
    return jsonError("Device ini sudah diklaim oleh pengguna lain.", 409);
  }

  const { error: updateError } = await getAdminClient()
    .from("devices")
    .update({
      user_id: user.id,
      name: `Device ${device.macAddress.slice(0, 6)}…`,
      claimed_at: new Date().toISOString(),
    })
    .eq("id", device.id);

  if (updateError) {
    console.error("[device/claim]", updateError.message);
    return jsonError("Gagal mengklaim device.", 500);
  }

  return NextResponse.json({
    ok: true,
    device: {
      macAddress: device.macAddress,
      claimed: true,
      alreadyClaimed: false,
    },
  });
}
