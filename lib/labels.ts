/**
 * Status tanaman dikirim perangkat sebagai teks langsung melalui Supabase
 * (contoh: "Sehat", "Sakit", "Mati"). Tidak ada kode angka yang perlu diterjemahkan,
 * jadi nilai dari database ditampilkan apa adanya.
 */
export function formatPlantStatus(value: string | null | undefined): string {
  const raw = value?.trim();
  return raw ? raw : "Belum ada data";
}
