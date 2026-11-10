import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MonteurScherm } from "@/components/installatie/MonteurScherm";
import { maakMonteurBeeld } from "@/lib/installatie/api";
import { leesAfspraak, leesToken } from "@/lib/installatie/store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "ZekerFlex monteur",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/** /monteur/<code>: het scherm van de monteur. Alleen een monteurcode opent hem; de klantcode geeft een 404. */
export default async function MonteurPagina(props: { params: Promise<{ code: string }> }) {
  const { code } = await props.params;
  const t = leesToken(code);
  if (!t || t.rol !== "monteur") notFound();
  const afspraak = await leesAfspraak(t.id);
  if (!afspraak) notFound();
  return <MonteurScherm code={code} begin={maakMonteurBeeld(afspraak, new Date())} />;
}
