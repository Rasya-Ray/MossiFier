/**
 * Status tanaman dikirim perangkat sebagai TEKS:
 * "HEALTHY" / "STRESSED" / "CRITICAL".
 * Untuk kompatibilitas, angka lama 0/1/2 masih diterima:
 * 0 = Sehat, 1 = Sakit, 2 = Mati.
 * Nilai lain / kosong ditampilkan sebagai "Belum ada data".
 */
export function plantStatusText(
  value: number | string | null | undefined,
): string {
  if (value === null || value === undefined || value === "") {
    return "Belum ada data";
  }

  const text = typeof value === "string" ? value.toUpperCase() : String(value);

  switch (text) {
    case "HEALTHY":
      return "Sehat";
    case "STRESSED":
      return "Sakit";
    case "CRITICAL":
      return "Mati";
    default:
      const code = Number(value);
      if (!Number.isFinite(code)) return "Belum ada data";
      switch (Math.trunc(code)) {
        case 0:
          return "Sehat";
        case 1:
          return "Sakit";
        case 2:
          return "Mati";
        default:
          return "Tidak diketahui";
      }
  }
}

/** Teks status → tone untuk badge/insight. */
export function plantStatusTone(
  value: number | string | null | undefined,
): "good" | "warn" | "bad" | "info" {
  if (value === null || value === undefined) return "info";
  const text = typeof value === "string" ? value.toUpperCase() : String(value);
  if (text === "HEALTHY") return "good";
  if (text === "STRESSED") return "warn";
  if (text === "CRITICAL") return "bad";
  const code = Number(value);
  if (!Number.isFinite(code)) return "info";
  if (code === 0) return "good";
  if (code === 1) return "warn";
  if (code === 2) return "bad";
  return "info";
}
