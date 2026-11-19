"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { SessionUser } from "@/lib/auth/types";

const SessionContext = createContext<SessionUser | null>(null);

/** Sesi login dari server (cookie) diteruskan ke client lewat provider ini. */
export function SessionProvider({
  user,
  children,
}: {
  user: SessionUser;
  children: ReactNode;
}) {
  return (
    <SessionContext.Provider value={user}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionUser | null {
  return useContext(SessionContext);
}
