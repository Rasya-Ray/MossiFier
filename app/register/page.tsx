import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { Register } from "@/components/auth/register";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Daftar",
};

export const instant = false;

async function RegisterGate() {
  const user = await getSession();
  if (user) redirect("/dashboard");
  return <Register />;
}

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterGate />
    </Suspense>
  );
}
