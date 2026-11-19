/** Status tanaman dari kolom `status`: 1 = Sehat, 2 = Sakit, 3 = Mati. */
export const PLANT_STATUS_MAP: Record<string, string> = {
  "1": "Sehat",
  "2": "Sakit",
  "3": "Mati",
  sehat: "Sehat",
  sakit: "Sakit",
  mati: "Mati",
};

export function formatPlantStatus(value: string | null | undefined): string {
  const raw = value?.trim();
  if (!raw) return "Belum ada data";
  return PLANT_STATUS_MAP[raw.toLowerCase()] ?? `Kode ${raw}`;
}
