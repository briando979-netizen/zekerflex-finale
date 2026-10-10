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
      <div className="pb-8" />
    </div>
  );
}
