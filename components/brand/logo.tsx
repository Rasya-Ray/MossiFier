import Image from "next/image";

type LogoProps = {
  /** Ukuran intrinsik (px). Ukuran tampilan bisa diatur lewat `className`. */
  size?: number;
  className?: string;
  priority?: boolean;
};

/**
 * Satu-satunya logo Mossifier untuk seluruh UI (navbar, sidebar, login,
 * register, chatbot). Aset: `public/logo-mossifier.png` — persegi, latar
 * transparan, diturunkan dari `logo-website.png`.
 */
export function Logo({ size = 40, className = "", priority = false }: LogoProps) {
  return (
    <Image
      src="/logo-mossifier.png"
      alt="Mossifier"
      width={size}
      height={size}
      priority={priority}
      className={`shrink-0 object-contain ${className}`}
    />
  );
}
