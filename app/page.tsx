import { Suspense } from "react";
import { getSession } from "@/lib/auth/session";
import { Navbar } from "@/components/layout/navbar";
import { Home } from "@/components/home/home";
import { Footer } from "@/components/layout/footer";

// Halaman ini membaca sesi (navbar berubah kalau sudah login).
export const instant = false;

async function SiteNavbar() {
  const session = await getSession();
  return <Navbar session={session} />;
}

export default function Page() {
  return (
    <div className="flex min-h-full flex-col">
      <Suspense fallback={<div className="h-[65px]" />}>
        <SiteNavbar />
      </Suspense>
      <div className="flex-1">
        <Home />
      </div>
      <Footer />
    </div>
  );
}
