"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useDeviceId } from "@/lib/device-store";
import { DeviceDialog } from "@/components/device/device-dialog";

type DeviceContextValue = {
  deviceId: string | null;
  openDialog: () => void;
};

const DeviceContext = createContext<DeviceContextValue | null>(null);

export function DeviceProvider({ children }: { children: ReactNode }) {
  const deviceId = useDeviceId();
  const [open, setOpen] = useState(false);

  const openDialog = useCallback(() => setOpen(true), []);
  const closeDialog = useCallback(() => setOpen(false), []);

  const value = useMemo(
    () => ({ deviceId, openDialog }),
    [deviceId, openDialog],
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
