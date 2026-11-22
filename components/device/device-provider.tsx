"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useDeviceId } from "@/lib/device-store";
import { useSession } from "@/components/auth/session-provider";
import {
  DEFAULT_DEVICE_MAC,
  DEMO_DEVICE_MAC,
  isDemoUser,
} from "@/lib/demo";
import { DeviceDialog } from "@/components/device/device-dialog";

type DeviceContextValue = {
  /** MAC address device aktif (12 hex), atau null kalau belum dipilih. */
  deviceId: string | null;
  /** False selama hydration: hindari kedipan "belum ada device" di HP. */
  ready: boolean;
  openDialog: () => void;
};

const DeviceContext = createContext<DeviceContextValue | null>(null);

function subscribeNoop(): () => void {
  return () => {};
}

function getClientHydrated(): boolean {
  return true;
}

function getServerHydrated(): boolean {
  return false;
}

export function DeviceProvider({ children }: { children: ReactNode }) {
  const session = useSession();
  const storedDeviceId = useDeviceId(session?.id ?? null);
  const [open, setOpen] = useState(false);

  // `false` saat SSR, `true` setelah hydration — tanpa setState di effect.
  const hydrated = useSyncExternalStore(
    subscribeNoop,
    getClientHydrated,
    getServerHydrated,
  );

  // Demo selalu memakai perangkat pameran. Akun lain langsung memakai device
  // default kalau belum memilih; pilihan manual per akun tetap menang.
  const deviceId = isDemoUser(session)
    ? DEMO_DEVICE_MAC
    : (storedDeviceId ?? DEFAULT_DEVICE_MAC);

  const openDialog = useCallback(() => setOpen(true), []);
  const closeDialog = useCallback(() => setOpen(false), []);

  const value = useMemo(
    () => ({ deviceId, ready: hydrated, openDialog }),
    [deviceId, hydrated, openDialog],
  );

  return (
    <DeviceContext.Provider value={value}>
      {children}
      <DeviceDialog open={open} current={deviceId} onClose={closeDialog} />
    </DeviceContext.Provider>
  );
}

export function useDevice(): DeviceContextValue {
  const value = useContext(DeviceContext);
  if (!value) {
    throw new Error("useDevice harus dipakai di dalam DeviceProvider");
  }
  return value;
}