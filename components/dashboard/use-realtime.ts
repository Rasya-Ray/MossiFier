"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  readCachedReadings,
  writeCachedReadings,
} from "@/lib/readings-cache";
import { SENSOR_COLUMNS, type SensorReading } from "@/lib/sensors";
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

/** Query riwayat terakhir untuk satu device. Fungsi murni — tanpa setState. */
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

/**
 * Data sensor device aktif langsung dari Supabase:
 * 1. Tampilkan cache pembacaan terakhir (kalau ada) supaya reload tidak kosong.
 * 2. Ambil riwayat terakhir sekali saat device dipilih.
 * 3. Subscribe Supabase Realtime (postgres_changes INSERT) hanya untuk device itu.
 * Tanpa device → tidak ada query, data kosong (bukan 0).
 *
 * State disimpan per `device_id` supaya pindah device tidak saling timpa.
 */
export function useRealtimeSensors(limit = HISTORY_LIMIT): SensorLiveState {
  const { deviceId } = useDevice();

  const [rowsByDevice, setRowsByDevice] = useState<
    Record<string, SensorReading[]>
  >({});
  const [statusByDevice, setStatusByDevice] = useState<
    Record<string, DeviceStatus>
  >({});

  const mounted = useRef(true);
  const inFlight = useRef(false);
  const requestSeq = useRef(0);
  const rowsRef = useRef<Record<string, SensorReading[]>>({});

  // Cache dibaca saat render (bukan lewat effect) agar tidak ada setState
  // sinkron di dalam effect.
  const cached = useMemo(
    () => (deviceId ? readCachedReadings(deviceId) : null),
    [deviceId],
  );

  const commit = useCallback((id: string, next: SensorReading[]) => {
    rowsRef.current[id] = next;
    setRowsByDevice((prev) => ({ ...prev, [id]: next }));
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

        // Gabungkan dengan baris realtime / cache yang sudah ada.
        const current =
          rowsRef.current[requested] ??
          readCachedReadings(requested)?.readings ??
          [];
        const merged = mergeReadings(current, rows, limit);

        commit(requested, merged);
        writeCachedReadings(requested, merged);
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
  }, [commit, deviceId, limit, patchStatus]);

  const refresh = useCallback(() => {
    if (!deviceId || inFlight.current) return;
    patchStatus(deviceId, { ready: false });
    load();
  }, [deviceId, load, patchStatus]);

  useEffect(() => {
    mounted.current = true;

    if (!deviceId) return;

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
          if (current.some((item) => item.id === row.id)) return;

          const next = mergeReadings(current, [row], limit);
          commit(deviceId, next);
          writeCachedReadings(deviceId, next);
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
  }, [commit, deviceId, limit, load, patchStatus]);

  const readings = deviceId
    ? (rowsByDevice[deviceId] ?? cached?.readings ?? [])
    : [];

  const status = (deviceId ? statusByDevice[deviceId] : undefined) ?? EMPTY_STATUS;

  return {
    readings,
    latest: readings.at(-1) ?? null,
    isFetching: deviceId ? !status.ready : false,
    lastUpdated: status.lastUpdated ?? cached?.savedAt ?? null,
    error: status.error,
    refresh,
  };
}
