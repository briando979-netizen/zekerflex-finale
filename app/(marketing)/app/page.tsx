import type { Metadata } from "next";
import { AppDownload } from "@/components/marketing/AppDownload";

export const metadata: Metadata = {
  // 22 nov 2026 (SEO-audit): op "flexwerk app" en "app voor bijbaan" scoort nog geen enkel flexplatform
  title: "Flexwerk-app: je bijbaan en klussen op je telefoon",
  description:
    "De ZekerFlex-app voor flexwerk en je bijbaan: reageer op klussen, check in op locatie, dien je uren in en volg je uitbetalingen. Voor iPhone en Android.",
  alternates: { canonical: "/app" },
};

export default function AppPage() {
  return (
    <div className="hero-ink text-white">
      <div className="shell pt-16 md:pt-20">
        <p className="eyebrow text-brand-mint">De ZekerFlex-app</p>
        <h1 className="mt-3 max-w-2xl text-balance font-display text-4xl font-bold leading-tight md:text-5xl">
          De flexwerk-app voor je bijbaan en klussen
        </h1>
      </div>
      <AppDownload standalone />
      {/* 21 nov 2026 (eigenaar: "haal dit weg"): geen link meer naar de apps voor bedrijven, horeca, rijschool en webshop */}
    </div>
  );
}
