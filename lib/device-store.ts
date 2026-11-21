"use client";

import { useMemo, useSyncExternalStore } from "react";

/**
 * Device aktif disimpan di localStorage **per akun** (key memakai id user),
 * jadi logout → login lagi tetap memakai device terakhir. Device tidak
 * dihapus saat logout supaya dashboard langsung menampilkan data terakhir,
 * bukan empty state.
 *
 * Versi lama memakai satu key global (`mossifier.device_id`); key itu
 * dimigrasikan sekali ke key per-akun saat pertama kali dibaca.
 */
const STORAGE_PREFIX = "mossifier.device_id";
const LEGACY_STORAGE_KEY = "mossifier.device_id";
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

function storageKey(userId: string | null | undefined): string {
  return `${STORAGE_PREFIX}.${userId ?? "guest"}`;
}

/** Baca nilai + migrasikan key lama (global) ke key per-akun. */
function readRaw(key: string): string | null {
  let raw = window.localStorage.getItem(key);

  if (raw === null) {
    const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy?.trim()) {
      window.localStorage.setItem(key, legacy);
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
      raw = legacy;
    }
  }

  return raw;
}

/**
 * Snapshot di-cache per key agar referensi stabil
 * (syarat `useSyncExternalStore`).
 */
function createSnapshotGetter(key: string): () => string | null {
  let cachedRaw: string | null = null;
  let cachedValue: string | null = null;
  let primed = false;

  return () => {
    const raw = readRaw(key);
    if (primed && raw === cachedRaw) return cachedValue;

    primed = true;
    cachedRaw = raw;
    cachedValue = raw && raw.trim() ? raw.trim() : null;
    return cachedValue;
  };
}

function getServerSnapshot(): string | null {
  return null;
}

export function useDeviceId(userId: string | null): string | null {
  const getSnapshot = useMemo(
    () => createSnapshotGetter(storageKey(userId)),
    [userId],
  );

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function saveDeviceId(deviceId: string, userId: string | null): void {
  if (typeof window === "undefined") return;
  const value = deviceId.trim();
  if (!value) return;
  window.localStorage.setItem(storageKey(userId), value);
  emit();
}

export function clearDeviceId(userId: string | null): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(storageKey(userId));
  emit();
}
