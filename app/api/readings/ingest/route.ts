import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { parseReading } from "@/lib/readings/validation";
import { setCachedLatest } from "@/lib/redis";

function jsonError(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}

function hasValidSecret(request: Request, secret: string): boolean {
  const provided = request.headers.get("x-mossifier-webhook-secret");
  if (!provided) return false;

  const expectedBytes = Buffer.from(secret);
  const providedBytes = Buffer.from(provided);
  return (
    expectedBytes.length === providedBytes.length &&
    timingSafeEqual(expectedBytes, providedBytes)
  );
}

/**
 * POST /api/readings/ingest — Supabase Database Webhook target for INSERTs
 * on public.devices. This keeps Redis current even if no dashboard is open.
 */
export async function POST(request: Request) {
  const secret = process.env.READINGS_WEBHOOK_SECRET;
  if (!secret) return jsonError("Ingest webhook belum dikonfigurasi.", 503);
  if (!hasValidSecret(request, secret)) {
    return jsonError("Webhook secret tidak valid.", 401);
  }

  const body = (await request.json().catch(() => null)) as unknown;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonError("Payload webhook tidak valid.", 400);
  }

  const event = body as Record<string, unknown>;
  if (
    event.type !== "INSERT" ||
    event.schema !== "public" ||
    event.table !== "devices"
  ) {
    return jsonError("Event webhook tidak didukung.", 400);
  }

  const reading = parseReading(event.record);
  if (!reading) return jsonError("Format pembacaan sensor tidak valid.", 400);

  const stored = await setCachedLatest(reading);
  if (!stored) return jsonError("Cache Redis belum bisa diperbarui.", 503);

  return NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
