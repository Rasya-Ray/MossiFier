import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { Login } from "@/components/auth/login";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Masuk",
};

export const instant = false;

async function LoginGate() {
  const user = await getSession();
  if (user) redirect("/dashboard");
  return <Login />;
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginGate />
    </Suspense>
  );
}
