import Image from "next/image";

/**
 * Logo Mossifier (daun + angin + sirkuit) — satu tempat untuk semua ukuran.
 * Berkas gambar: public/logo-website.png (ganti berkas itu untuk mengganti logo
 * di navbar, sidebar, login, dan register). Favicon: app/icon.png.
 * Atur ukuran lewat prop `size` (piksel), tidak perlu mengubah class lain.
 */
export function BrandLogo({
  size = 48,
  className = "",
  priority = false,
}: {
  size?: number;
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src="/logo-website.png"
      alt="Logo Mossifier"
      width={size}
      height={size}
      priority={priority}
      className={`shrink-0 object-contain drop-shadow-lg ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
