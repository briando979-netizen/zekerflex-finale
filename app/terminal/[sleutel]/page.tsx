import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TerminalScherm } from "@/components/incheck/TerminalScherm";
import { terminalVanSleutel } from "@/lib/incheck/store";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Inchecken | ZekerFlex", robots: { index: false, follow: false } };

// De tablet aan de muur opent dit adres (zie Werkgever → Inchecken op locatie). De
// sleutel in het adres is het bewijs; hij komt nergens in een log.
export default async function TerminalPagina({ params }: { params: Promise<{ sleutel: string }> }) {
  const { sleutel } = await params;
  const t = await terminalVanSleutel(sleutel).catch(() => null);
  if (!t) notFound();
  return <TerminalScherm sleutel={sleutel} />;
}
