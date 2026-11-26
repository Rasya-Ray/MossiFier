import type { CardTone } from "@/lib/air-quality";

/**
 * Warna status memakai 5 warna hutan yang sudah ada.
 * good=lime, moderate=fern, tidak sehat=mist/pine, berbahaya=mist penuh.
 */
export const AIR_TONE_STYLE: Record<
  CardTone,
  { card: string; badge: string; bar: string }
> = {
  neutral: {
    card: "border-white/20 bg-white/10",
    badge: "border border-white/20 bg-white/10 text-forest-mist/80",
    bar: "bg-forest-mist/40",
  },
  good: {
    card: "border-forest-lime/40 bg-white/10",
    badge: "bg-forest-lime text-forest-night",
    bar: "bg-forest-lime",
  },
  moderate: {
    card: "border-forest-fern/50 bg-white/10",
    badge: "bg-forest-fern text-forest-mist",
    bar: "bg-forest-fern",
  },
  unhealthy: {
    card: "border-forest-mist/30 bg-forest-pine/40",
    badge: "border border-forest-mist/40 bg-forest-pine/70 text-forest-mist",
    bar: "bg-forest-mist/70",
  },
  veryUnhealthy: {
    card: "border-forest-mist/50 bg-forest-night/40",
    badge: "border border-forest-mist/50 bg-forest-night/80 text-forest-mist",
    bar: "bg-forest-mist",
  },
  hazardous: {
    card: "border-forest-mist/70 bg-forest-pine/60",
    badge: "bg-forest-mist text-forest-night",
    bar: "bg-forest-mist",
  },
};
