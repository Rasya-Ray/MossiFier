/**
 * Latar hutan tetap (fixed) di belakang semua halaman.
 * Gambar: public/forest.svg (hutan pinus berkabut). Overlay gradien memastikan
 * kontras teks tetap aman, dan "orb" blur memberi kedalaman untuk efek kaca.
 */
export function ForestBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-20 overflow-hidden bg-forest-night"
    >
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url(/forest.svg)" }}
      />
      <div className="absolute inset-0 bg-linear-to-b from-forest-night/50 via-forest-night/20 to-forest-night/70" />
      <div className="absolute -top-32 -left-24 h-96 w-96 rounded-full bg-forest-lime/20 blur-3xl" />
      <div className="absolute right-0 bottom-0 h-112 w-md rounded-full bg-forest-fern/25 blur-3xl" />
    </div>
  );
}
