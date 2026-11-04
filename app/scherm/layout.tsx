import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";

// De schermen van het horeca-pakket (keuken, bar, handheld, …): volledig
// scherm, donker (rustig in keuken en zaal, goed leesbaar op afstand), zonder
// de menu's van de site. Niet voor zoekmachines. Met een eigen manifest, zodat
// "Zet op beginscherm" een losse app zonder adresbalk geeft.

export const metadata: Metadata = {
  title: { default: "Schermen", template: "%s · ZekerFlex Horeca" },
  robots: { index: false, follow: false },
  manifest: "/scherm/manifest.webmanifest",
  appleWebApp: { capable: true, title: "ZekerFlex Schermen", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = { themeColor: "#0B0F0D", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function SchermLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-[100dvh] bg-[#0B0F0D] text-[#EEF2EF] antialiased">{children}</div>;
}
