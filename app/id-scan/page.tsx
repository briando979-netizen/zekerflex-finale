import type { Metadata } from "next";
import { getLocale } from "@/lib/i18n/server";
import { IdScanTelefoon } from "@/components/app/IdScanTelefoon";

// "Verder op je telefoon": de QR-code van de ID-scan op de laptop opent deze pagina
// met de eenmalige code na de # (components/app/IdScanTelefoon.tsx, lib/kyc/overdracht.ts).
// Niet ingelogd, niet te vinden in zoekmachines.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "ID-scan · ZekerFlex",
  robots: { index: false, follow: false },
};

export default async function IdScanPagina() {
  return <IdScanTelefoon locale={await getLocale()} />;
}
