import type { Metadata } from "next";
import { AppDownload } from "@/components/marketing/AppDownload";

export const metadata: Metadata = {
  title: "Download de app",
  description:
    "Installeer ZekerFlex als app op je telefoon (iOS en Android): reageer op klussen, check in op locatie, dien je uren in en volg je uitbetalingen.",
  alternates: { canonical: "/app" },
};

export default function AppPage() {
  return (
    <div className="hero-ink text-white">
      <div className="shell pt-16 md:pt-20">
        <p className="eyebrow text-brand-mint">De ZekerFlex-app</p>
        <h1 className="mt-3 max-w-2xl text-balance font-display text-4xl font-bold leading-tight md:text-5xl">
          Alles wat je nodig hebt, op je telefoon
        </h1>
      </div>
      <AppDownload standalone />
      {/* 15 nov 2026: een eigen app per doelgroep (lib/apps/catalogus.ts) */}
      <div className="shell pb-10">
        <a href="/apps" className="inline-flex items-center gap-2 text-sm font-semibold text-brand-mint hover:underline">
          Liever een eigen app voor je bedrijf, je horecazaak, je rijschool of je webshop? Bekijk alle apps →
        </a>
      </div>
    </div>
  );
}
