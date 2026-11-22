/**
 * Status tanaman dikirim perangkat sebagai KODE ANGKA:
 * 0 = Sehat, 1 = Sakit, 2 = Mati.
 * Nilai lain / kosong ditampilkan sebagai "Belum ada data".
 */
export function plantStatusText(
  value: number | string | null | undefined,
): string {
  if (value === null || value === undefined || value === "") {
    return "Belum ada data";
  }

  const code = typeof value === "number" ? value : Number(value);
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

/** Kode numerik status → tone untuk badge/insight. */
export function plantStatusTone(
  value: number | null | undefined,
): "good" | "warn" | "bad" | "info" {
  if (value === null || value === undefined) return "info";
  if (value === 0) return "good";
  if (value === 1) return "warn";
  if (value === 2) return "bad";
  return "info";
}