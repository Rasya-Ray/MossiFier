"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  readCachedReadings,
  writeCachedReadings,
} from "@/lib/readings-cache";
import {
  SENSOR_COLUMNS,
  type LatestReadingResponse,
  type SensorReading,
} from "@/lib/sensors";
import { useDevice } from "@/components/device/device-provider";

/** Jumlah baris riwayat yang disimpan untuk grafik. */
export const HISTORY_LIMIT = 20;

export type SensorLiveState = {
  /** Urut lama → baru (baris terakhir = paling baru). */
  readings: SensorReading[];
  latest: SensorReading | null;
  isFetching: boolean;
  lastUpdated: number | null;
  error: string | null;
  refresh: () => void;
};

type DeviceStatus = {
  ready: boolean;
  error: string | null;
  lastUpdated: number | null;
};

const EMPTY_STATUS: DeviceStatus = {
  ready: false,
  error: null,
  lastUpdated: null,
};

/** Nama channel harus unik per instance hook di satu client. */
let channelSeq = 0;

/** Query riwayat terakhir untuk grafik. */
async function loadReadings(
  deviceId: string,
  limit: number,
): Promise<SensorReading[]> {
  const { data, error } = await supabase
    .from("devices")
    .select(SENSOR_COLUMNS)
    .eq("device_id", deviceId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return ((data ?? []) as SensorReading[]).slice().reverse();
}

function readingTime(reading: SensorReading): number {
  const time = Date.parse(reading.created_at);
  return Number.isFinite(time) ? time : 0;
}

/** Gabung + dedupe berdasarkan `id`, urut lama → baru, simpan `limit` terakhir. */
function mergeReadings(
  current: SensorReading[],
  incoming: SensorReading[],
  limit: number,
): SensorReading[] {
  const byId = new Map<string, SensorReading>();

  for (const row of current) byId.set(row.id, row);
  for (const row of incoming) byId.set(row.id, row);

  return [...byId.values()]
    .sort((a, b) => readingTime(a) - readingTime(b))
    .slice(-limit);
}

function postLatestToRedis(reading: SensorReading): void {
  void fetch("/api/readings/latest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(reading),
    cache: "no-store",
  }).catch(() => {
    // Redis akan tetap dicoba lagi saat GET/cache-miss atau INSERT berikutnya.
  });
}

/**
 * Data sensor device aktif:
 * 1. Tampilkan cache browser jika ada.
 * 2. Ambil satu pembacaan terakhir melalui API (Redis-first) agar nilai utama
 *    langsung muncul setelah login / saat perangkat sedang offline.
 * 3. Ambil 20 baris Supabase hanya untuk grafik, lalu dengarkan Realtime INSERT.
 * 4. Sinkronkan pembacaan terbaru ke Redis melalui server (kredensial tidak ke browser).
 */
export function useRealtimeSensors(limit = HISTORY_LIMIT): SensorLiveState {
  const { deviceId } = useDevice();

  const [rowsByDevice, setRowsByDevice] = useState<
    Record<string, SensorReading[]>
  >({});
  const [latestByDevice, setLatestByDevice] = useState<
    Record<string, SensorReading>
  >({});
  const [statusByDevice, setStatusByDevice] = useState<
    Record<string, DeviceStatus>
  >({});
  const [cachedAtByDevice, setCachedAtByDevice] = useState<
    Record<string, number>
  >({});

  const mounted = useRef(true);
  const inFlight = useRef(false);
  const requestSeq = useRef(0);
  const rowsRef = useRef<Record<string, SensorReading[]>>({});
  const latestRef = useRef<Record<string, SensorReading>>({});

  const commit = useCallback((id: string, next: SensorReading[]) => {
    rowsRef.current[id] = next;
    setRowsByDevice((prev) => ({ ...prev, [id]: next }));
  }, []);

  const updateLatest = useCallback((id: string, next: SensorReading) => {
    const current =
      latestRef.current[id] ??
      rowsRef.current[id]?.at(-1) ??
      readCachedReadings(id)?.readings.at(-1);

    if (current && readingTime(current) > readingTime(next)) return;

    latestRef.current[id] = next;
    setLatestByDevice((prev) => ({ ...prev, [id]: next }));
  }, []);

  const patchStatus = useCallback(
    (id: string, patch: Partial<DeviceStatus>) => {
      setStatusByDevice((prev) => ({
        ...prev,
        [id]: { ...(prev[id] ?? EMPTY_STATUS), ...patch },
      }));
    },
    [],
  );

  const load = useCallback(() => {
    if (!deviceId) return;

    const requested = deviceId;
    const requestId = ++requestSeq.current;
    inFlight.current = true;

    void loadReadings(requested, limit)
      .then((rows) => {
        if (!mounted.current || requestId !== requestSeq.current) return;

        const current =
          rowsRef.current[requested] ??
          readCachedReadings(requested)?.readings ??
          [];
        const merged = mergeReadings(current, rows, limit);

        commit(requested, merged);
        writeCachedReadings(requested, merged);

        const newest = rows.at(-1);
        if (newest) {
          updateLatest(requested, newest);
          postLatestToRedis(newest);
        }

        patchStatus(requested, {
          ready: true,
          error: null,
          lastUpdated: Date.now(),
        });
      })
      .catch(() => {
        if (!mounted.current || requestId !== requestSeq.current) return;
        patchStatus(requested, {
          ready: true,
          error: "Koneksi Supabase terputus. Menampilkan data terakhir tersimpan.",
        });
      })
      .finally(() => {
        if (requestId === requestSeq.current) inFlight.current = false;
      });
  }, [commit, deviceId, limit, patchStatus, updateLatest]);

  const refresh = useCallback(() => {
    if (!deviceId || inFlight.current) return;
    patchStatus(deviceId, { ready: false });
    load();
  }, [deviceId, load, patchStatus]);

  /*
   * localStorage tidak tersedia di server. Kalau cache dibaca langsung saat
   * render, server menghasilkan skeleton sementara client langsung menampilkan
   * data → HTML tidak cocok dan React melempar hydration error. Cache dibaca
   * di sini (setelah mount), jadi render pertama server & client identik.
   */
  useEffect(() => {
    if (!deviceId) return;
    const cached = readCachedReadings(deviceId);
    const newest = cached?.readings.at(-1);
    if (!cached || !newest) return;

    commit(
      deviceId,
      mergeReadings(
        rowsRef.current[deviceId] ?? [],
        cached.readings,
        limit,
      ),
    );
    updateLatest(deviceId, newest);
    setCachedAtByDevice((prev) => ({ ...prev, [deviceId]: cached.savedAt }));
  }, [commit, deviceId, limit, updateLatest]);

  useEffect(() => {
    mounted.current = true;
    if (!deviceId) return;

    // Read the single latest row from Redis first; on a cache miss the API
    // initializes it from one Supabase row. This is independent of chart history.
    void fetch(
      `/api/readings/latest?deviceId=${encodeURIComponent(deviceId)}`,
      { cache: "no-store" },
    )
      .then(async (response) => {
        if (!response.ok) throw new Error("latest unavailable");
        return (await response.json()) as LatestReadingResponse;
      })
      .then((result) => {
        if (!mounted.current || !result.reading) return;
        updateLatest(deviceId, result.reading);
        patchStatus(deviceId, {
          ready: true,
          error: null,
          lastUpdated: result.cachedAt ?? Date.now(),
        });
      })
      .catch(() => {
        if (mounted.current) {
          patchStatus(deviceId, {
            ready: true,
            error: "Cache terakhir belum tersedia; mencoba mengambil data sensor.",
          });
        }
      });

    // History is used only by trend charts; main values already load from Redis.
    load();

    channelSeq += 1;
    const channel = supabase
      .channel(`devices-live-${channelSeq}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "devices",
          filter: `device_id=eq.${deviceId}`,
        },
        (payload) => {
          const row = payload.new as SensorReading;
          if (!row?.id || row.device_id !== deviceId) return;

          const current =
            rowsRef.current[deviceId] ??
            readCachedReadings(deviceId)?.readings ??
            [];
          const next = mergeReadings(current, [row], limit);
          commit(deviceId, next);
          writeCachedReadings(deviceId, next);
          updateLatest(deviceId, row);
          postLatestToRedis(row);
          patchStatus(deviceId, {
            ready: true,
            error: null,
            lastUpdated: Date.now(),
          });
        },
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          patchStatus(deviceId, {
            error: "Realtime Supabase terputus, mencoba menyambung ulang…",
          });
        }
      });

    return () => {
      mounted.current = false;
      void supabase.removeChannel(channel);
    };
  }, [commit, deviceId, limit, load, patchStatus, updateLatest]);

  const readings = deviceId ? (rowsByDevice[deviceId] ?? []) : [];
  const latest = deviceId
    ? (latestByDevice[deviceId] ?? readings.at(-1) ?? null)
    : null;
  const status = (deviceId ? statusByDevice[deviceId] : undefined) ?? EMPTY_STATUS;

  return {
    readings,
    latest,
    isFetching: deviceId ? !status.ready : false,
    lastUpdated:
      status.lastUpdated ?? (deviceId ? cachedAtByDevice[deviceId] : null) ?? null,
    error: status.error,
    refresh,
  };
}
