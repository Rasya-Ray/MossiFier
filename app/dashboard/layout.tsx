import { Suspense, type ReactNode } from "react";
import { type Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { SessionProvider } from "@/components/auth/session-provider";
import { DeviceProvider } from "@/components/device/device-provider";
import { MascotPhysics } from "@/components/dashboard/mascot-physics";
import { Sidebar } from "@/components/dashboard/sidebar";

export const metadata: Metadata = {
  title: "Dashboard",
};

export const instant = false;

async function DashboardShell({ children }: { children: ReactNode }) {
  const user = await getSession();
  if (!user) redirect("/login");

  return (
    <SessionProvider user={user}>
      <DeviceProvider>
        {/* Overlay: dashboard lebih tenang agar grafik & angka mudah dibaca */}
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 -z-10 bg-forest-night/60 backdrop-blur-[3px]"
        />
        <div className="min-h-full text-forest-mist">
          <Sidebar />
          <div className="lg:pl-64">{children}</div>
          <MascotPhysics size={96} />
        </div>
      </DeviceProvider>
    </SessionProvider>
  );
}

export default function DashboardLayout({
  children,
}: LayoutProps<"/dashboard">) {
  return (
    <Suspense fallback={<div className="min-h-full" />}>
      <DashboardShell>{children}</DashboardShell>
    </Suspense>
  );
}
