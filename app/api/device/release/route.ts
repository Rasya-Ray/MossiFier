import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { findDeviceForUser } from "@/lib/device-access";
import { isDemoUser } from "@/lib/demo";
import { getAdminClient } from "@/lib/supabase-admin";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/** POST /api/device/release — { macAddress } : lepas klaim device sendiri. */
export async function POST(request: Request) {
  const user = await getSession();
  if (!user) return jsonError("Silakan masuk dulu.", 401);
  if (isDemoUser(user)) {
    return jsonError("Mode demo tidak mengubah kepemilikan device.", 400);
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const access = await findDeviceForUser(body?.macAddress, user);
  if (!access.ok) return jsonError(access.error, access.status);

  const { device } = access;
  if (device.ownerId !== user.id) {
    return jsonError("Device ini bukan milikmu.", 403);
  }

  const { error: updateError } = await getAdminClient()
    .from("devices")
    .update({ user_id: null, name: null, claimed_at: null })
    .eq("id", device.id);

  if (updateError) {
    console.error("[device/release]", updateError.message);
    return jsonError("Gagal melepas device.", 500);
  }

  return NextResponse.json({
    ok: true,
    macAddress: device.macAddress,
    released: true,
  });
}
