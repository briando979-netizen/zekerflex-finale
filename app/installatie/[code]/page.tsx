import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InstallatieVolg } from "@/components/installatie/InstallatieVolg";
import { maakKlantBeeld } from "@/lib/installatie/model";
import { leesAfspraak, leesToken } from "@/lib/installatie/store";

export const dynamic = "force-dynamic";

// De link zit in een mail naar de klant: niet indexeren, en de code nooit in een verwijzing meegeven.
export const metadata: Metadata = {
  title: "Je installatie volgen",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/** /installatie/<code>: de klant volgt de monteur. Elke code die niet klopt, geeft gewoon een 404. */
export default async function InstallatiePagina(props: { params: Promise<{ code: string }> }) {
  const { code } = await props.params;
  const t = leesToken(code);
  if (!t) notFound();
  const afspraak = await leesAfspraak(t.id);
  if (!afspraak) notFound();
  return <InstallatieVolg code={code} begin={maakKlantBeeld(afspraak, new Date())} />;
}
