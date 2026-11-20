import { BrainChat } from "@/components/brain/BrainChat";
import { SamenTabs } from "@/components/werkgever/SamenTabs";
import { getDict } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

// De assistent voor een bedrijf (15 nov 2026): de vragen en hulpmiddelen van het bedrijf, met een eigen kop en welkom.
// Met de vlag publiek-alleen-flexwerk een tabblad onder Chat (lib/werkgever/samen-tabs.ts).
export default async function AssistentPage() {
  const t = (await getDict()).assistent;
  return (
    <>
      <SamenTabs groep="chat" actief="assistent" />
      <div className="mx-auto h-[calc(100dvh-9rem)] max-w-2xl overflow-hidden rounded-2xl border border-hair">
        <BrainChat app="werkgever" kop={{ sub: t.sub, hoi: t.hoi }} />
      </div>
    </>
  );
}
