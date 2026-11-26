"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  readCachedReadings,
  writeCachedReadings,
} from "@/lib/readings-cache";
import type { LatestReadingResponse, PublicSensorReading } from "@/lib/sensors";
import { useDevice } from "@/components/device/device-provider";

/** Jumlah baris riwayat yang disimpan untuk grafik. */
export const HISTORY_LIMIT = 20;

/**
 * Tabel `devices` memakai RLS tanpa policy anon, jadi browser tidak
 * bisa query langsung / berlangganan Realtime. Dashboard memakai API server
 * (service role). Supaya data tetap segar tanpa refresh, riwayat ditarik
 * berkala dari `/api/readings/history`.
 */
const POLL_INTERVAL_MS = 10_000;

export type SensorLiveState = {
  /** Urut lama → baru (baris terakhir = paling baru). */
  readings: PublicSensorReading[];
  latest: PublicSensorReading | null;
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

/** Query riwayat terakhir untuk grafik (lewat API server). */
async function loadReadings(
  deviceId: string,
  limit: number,
): Promise<PublicSensorReading[]> {
  const response = await fetch(
    `/api/readings/history?deviceId=${encodeURIComponent(deviceId)}&limit=${limit}`,
    { cache: "no-store" },
  );
  if (!response.ok) throw new Error("history unavailable");
  const result = (await response.json()) as {
    readings: PublicSensorReading[];
  };
  return result.readings ?? [];
}

function readingTime(reading: { created_at: string }): number {
  const time = Date.parse(reading.created_at);
  return Number.isFinite(time) ? time : 0;
}

/** Gabung + dedupe berdasarkan `id`, urut lama → baru, simpan `limit` terakhir. */
function mergeReadings(
  current: PublicSensorReading[],
  incoming: PublicSensorReading[],
  limit: number,
): PublicSensorReading[] {
  const byCreated = new Map<string, PublicSensorReading>();
  for (const row of current) byCreated.set(row.created_at, row);
  for (const row of incoming) byCreated.set(row.created_at, row);
  return [...byCreated.values()]
    .sort((a, b) => readingTime(a) - readingTime(b))
    .slice(-limit);
}

/**
 * Data sensor device aktif (device_id):
 * 1. Tampilkan cache browser jika ada.
 * 2. Ambil satu pembacaan terakhir melalui API (Redis-first).
 * 3. Ambil 20 baris riwayat lewat API server untuk grafik.
 * 4. Polling ringan tiap 10 detik (RLS tidak mengizinkan Realtime di browser).
 */
export function useRealtimeSensors(limit = HISTORY_LIMIT): SensorLiveState {
  const { deviceId } = useDevice();

  const [rowsByDevice, setRowsByDevice] = useState<
    Record<string, PublicSensorReading[]>
  >({});
  const [latestByDevice, setLatestByDevice] = useState<
    Record<string, PublicSensorReading>
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
  const rowsRef = useRef<Record<string, PublicSensorReading[]>>({});
  const latestRef = useRef<Record<string, PublicSensorReading>>({});

  const commit = useCallback((id: string, next: PublicSensorReading[]) => {
    rowsRef.current[id] = next;
    setRowsByDevice((prev) => ({ ...prev, [id]: next }));
  }, []);

  const updateLatest = useCallback((id: string, next: PublicSensorReading) => {
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

  const load = useCallback(
    (silent: boolean) => {
      if (!deviceId) return;

      const requested = deviceId;
      const requestId = ++requestSeq.current;
      if (!silent) inFlight.current = true;

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
          if (newest) updateLatest(requested, newest);

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
            error:
              "Data sensor belum bisa dimuat. Menampilkan data terakhir tersimpan.",
          });
        })
        .finally(() => {
          if (requestId === requestSeq.current) inFlight.current = false;
        });
    },
    [commit, deviceId, limit, patchStatus, updateLatest],
  );

  const refresh = useCallback(() => {
    if (!deviceId || inFlight.current) return;
    patchStatus(deviceId, { ready: false });
    load(false);
  }, [deviceId, load, patchStatus]);

  useEffect(() => {
    if (!deviceId) return;
    const cached = readCachedReadings(deviceId);
    const newest = cached?.readings.at(-1);
    if (!cached || !newest) return;

    commit(
      deviceId,
      mergeReadings(rowsRef.current[deviceId] ?? [], cached.readings, limit),
    );
    updateLatest(deviceId, newest);
    setCachedAtByDevice((prev) => ({ ...prev, [deviceId]: cached.savedAt }));
  }, [commit, deviceId, limit, updateLatest]);

  useEffect(() => {
    mounted.current = true;
    if (!deviceId) return;

    // Baca satu pembacaan terakhir dari Redis dulu (cepat), lalu riwayat.
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
        // Riwayat di bawah tetap dicoba; error ditampilkan oleh `load`.
      });

    load(false);

    const timer = window.setInterval(() => load(true), POLL_INTERVAL_MS);

    return () => {
      mounted.current = false;
      window.clearInterval(timer);
    };
  }, [deviceId, load, limit, patchStatus, updateLatest]);

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
