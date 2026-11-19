"use client";

import { useSyncExternalStore } from "react";

/**
 * Device aktif yang dipilih user (disimpan di localStorage).
 * Kalau belum ada device, dashboard tidak menampilkan data (bukan 0).
 */
const STORAGE_KEY = "mossifier.device_id";
const STORAGE_EVENT = "mossifier:device";

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  window.addEventListener(STORAGE_EVENT, listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
    window.removeEventListener(STORAGE_EVENT, listener);
  };
}

function emit(): void {
  for (const listener of listeners) listener();
}

/** Snapshot di-cache agar referensi stabil (syarat useSyncExternalStore). */
let cache: { raw: string | null; value: string | null } = {
  raw: null,
  value: null,
};

function getSnapshot(): string | null {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (cache.raw === raw) return cache.value;

  const value = raw && raw.trim() ? raw.trim() : null;
  cache = { raw, value };
  return value;
}

function getServerSnapshot(): string | null {
  return null;
}

export function useDeviceId(): string | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function saveDeviceId(deviceId: string): void {
  if (typeof window === "undefined") return;
  const value = deviceId.trim();
  if (!value) return;
  window.localStorage.setItem(STORAGE_KEY, value);
  emit();
}

export function clearDeviceId(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
  emit();
}
