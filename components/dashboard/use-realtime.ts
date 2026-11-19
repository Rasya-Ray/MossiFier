"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
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

/**
 * Data sensor device aktif langsung dari Supabase:
 * 1. Ambil riwayat terakhir sekali saat device dipilih.
 * 2. Subscribe Supabase Realtime (postgres_changes INSERT) hanya untuk device itu.
 * Tanpa device → tidak ada query, data kosong (bukan 0).
 */
export function useRealtimeSensors(limit = HISTORY_LIMIT): SensorLiveState {
  const { deviceId } = useDevice();

  const [readings, setReadings] = useState<SensorReading[]>([]);
  const [ready, setReady] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mounted = useRef(true);
  const inFlight = useRef(false);

  const load = useCallback(() => {
    if (!deviceId || inFlight.current) return;
    inFlight.current = true;

    void loadReadings(deviceId, limit)
      .then((rows) => {
        if (!mounted.current) return;
        setReadings(rows);
        setLastUpdated(Date.now());
        setError(null);
      })
      .catch(() => {
        if (mounted.current) {
          setError("Koneksi Supabase terputus. Data terakhir tetap dipakai.");
        }
      })
      .finally(() => {
        inFlight.current = false;
        if (mounted.current) setReady(true);
      });
  }, [deviceId, limit]);

  const refresh = useCallback(() => {
    if (!deviceId || inFlight.current) return;
    setReady(false);
    load();
  }, [deviceId, load]);

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

          setReadings((prev) => {
            if (prev.some((item) => item.id === row.id)) return prev;
            return [...prev, row].slice(-limit);
          });
          setLastUpdated(Date.now());
          setError(null);
        },
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setError("Realtime Supabase terputus, mencoba menyambung ulang…");
        }
      });

    return () => {
      mounted.current = false;
      void supabase.removeChannel(channel);
    };
  }, [deviceId, load, limit]);

  const visible = deviceId
    ? readings.filter((reading) => reading.device_id === deviceId)
    : [];

  return {
    readings: visible,
    latest: visible.at(-1) ?? null,
    isFetching: deviceId ? !ready : false,
    lastUpdated,
    error,
    refresh,
  };
}
