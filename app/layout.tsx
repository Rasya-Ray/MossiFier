import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "react-toastify/dist/ReactToastify.css";
import "./globals.css";
import { ToastProvider } from "@/components/providers/toast-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Mossifier — IoT Monitoring Dashboard",
    template: "%s | Mossifier",
  },
  description:
    "Dashboard monitoring IoT real-time untuk kualitas udara, kelembapan, kipas, LED, dan kondisi tanaman berbasis Supabase.",
  keywords: [
    "Mossifier",
    "IoT dashboard",
    "Supabase",
    "monitoring tanaman",
    "sensor kualitas udara",
  ],
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    locale: "id_ID",
    url: "/",
    siteName: "Mossifier",
    title: "Mossifier — IoT Monitoring Dashboard",
    description:
      "Pantau kondisi tanaman dan sensor lingkungan secara real-time.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Mossifier — IoT Monitoring Dashboard",
    description:
      "Pantau kondisi tanaman dan sensor lingkungan secara real-time.",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="id"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-moss-paper text-moss-forest">
        {children}
        <ToastProvider />
      </body>
    </html>
  );
}
