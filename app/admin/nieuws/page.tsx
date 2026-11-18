import { getPrincipal, hasRole } from "@/lib/auth";
import { featureEnabled } from "@/lib/flags";
import { timeAgoNl } from "@/lib/admin/format";
import { Empty, KpiStrip, PageHead, Panel, Pill } from "@/components/admin/kit";
import { NieuwsBerichtKnoppen, NieuwsStandKnoppen } from "@/components/admin/NieuwsKnoppen";
import { NIEUWS_BRONNEN } from "@/lib/nieuws/bronnen";
import { RUBRIEK_NAAM, type NieuwsBericht } from "@/lib/nieuws/regels";
import { NIEUWS_VLAG } from "@/lib/nieuws/ronde";
import { alleBerichten, leesNieuwsStand } from "@/lib/nieuws/store";

export const dynamic = "force-dynamic";

const STATUS_NAAM = { concept: "Wacht op jou", geplaatst: "Op de site", verborgen: "Van de site gehaald" } as const;
const STATUS_TOON = { concept: "warn", geplaatst: "ok", verborgen: "neutral" } as const;

// Beheer → Marketing → Nieuwsroom: de berichten die de site zelf schrijft uit openbare bronnen (lib/nieuws). Hier keur je
// een concept goed, haal je een bericht van de site en kies je of nieuwe berichten eerst op jou wachten of vanzelf gaan.
export default async function NieuwsBeheerPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="De nieuwsroom is alleen beschikbaar voor platformbeheerders." />;
  }
  const [vanzelf, stand, berichten] = await Promise.all([featureEnabled(NIEUWS_VLAG), leesNieuwsStand(), alleBerichten().catch((): NieuwsBericht[] => [])]);
  const tel = (s: NieuwsBericht["status"]) => berichten.filter((b) => b.status === s).length;

  return (
    <div className="space-y-5">
      <PageHead
        title="Nieuwsroom"
        subtitle={`De site leest vier keer per dag het nieuws van ${NIEUWS_BRONNEN.map((b) => b.naam).join(", ")}, kiest wat over werk en ondernemen gaat en schrijft er een eigen, kort bericht over met de bron erbij. Elk getal in een bericht moet letterlijk in de bron staan, anders wordt het afgekeurd.`}
        actions={
          <span className="flex flex-wrap items-center gap-2">
            <Pill tone={vanzelf ? "ok" : "warn"}>{vanzelf ? "Vanzelf plaatsen" : "Eerst goedkeuren"}</Pill>
            <NieuwsStandKnoppen vanzelf={vanzelf} />
          </span>
        }
      />
      <KpiStrip
        items={[
          { label: "Wacht op jou", value: String(tel("concept")) },
          { label: "Op de site", value: String(tel("geplaatst")) },
          { label: "Van de site gehaald", value: String(tel("verborgen")) },
          { label: "Laatste ronde", value: stand ? timeAgoNl(stand.at) : "nog niet" },
        ]}
      />

      {stand ? (
        <Panel title="Laatste ronde" subtitle={`${timeAgoNl(stand.at)}: ${stand.bekeken} nieuwe berichten bekeken, ${stand.paste} pasten bij ons, ${stand.geschreven} geschreven, ${stand.geplaatst} vanzelf geplaatst, ${stand.afgekeurd.length} afgekeurd.`}>
          {stand.fout ? (
            <p role="alert" className="text-[0.8125rem]" style={{ color: "var(--a-text)" }}>
              Niet alles lukte: {stand.fout}
            </p>
          ) : null}
          {stand.afgekeurd.length ? (
            <ul className="space-y-1">
              {stand.afgekeurd.map((a, i) => (
                <li key={i} className="text-[0.8125rem]" style={{ color: "var(--a-mute)" }}>
                  Afgekeurd: {a.titel} ({a.reden})
                </li>
              ))}
            </ul>
          ) : null}
          {!stand.fout && stand.afgekeurd.length === 0 ? (
            <p className="text-[0.8125rem]" style={{ color: "var(--a-mute)" }}>
              Geen fouten en niets afgekeurd.
            </p>
          ) : null}
        </Panel>
      ) : null}

      <Panel flush title="Berichten" subtitle="Nieuwste bovenaan. Open een bericht om het te lezen zoals een bezoeker het ziet; een concept is alleen voor jou zichtbaar.">
        {berichten.length === 0 ? (
          <Empty title="Nog geen berichten" body='Druk op "Nu nieuws ophalen" om de eerste ronde te draaien, of wacht op de volgende vaste ronde.' />
        ) : (
          <ul>
            {berichten.map((b) => (
              <li key={b.slug} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-5" style={{ borderTop: "1px solid var(--a-border)" }}>
                <span className="min-w-0 flex-1">
                  <a href={`/nieuws/${b.slug}`} target="_blank" rel="noreferrer" className="block text-[0.875rem] font-medium underline-offset-2 hover:underline" style={{ color: "var(--a-text)" }}>
                    {b.titel}
                  </a>
                  <span className="block text-xs" style={{ color: "var(--a-mute)" }}>
                    {RUBRIEK_NAAM[b.rubriek] ?? b.rubriek} · {timeAgoNl(b.geplaatst ?? b.gemaakt)} · bron: {b.bron.naam}
                    {b.door ? ` · geplaatst door ${b.door === "vanzelf" ? "de site zelf" : b.door}` : ""}
                  </span>
                  <span className="mt-0.5 block text-xs" style={{ color: "var(--a-dim)" }}>
                    {b.samenvatting}
                  </span>
                </span>
                <span className="flex flex-shrink-0 flex-wrap items-center gap-2">
                  <Pill tone={STATUS_TOON[b.status] ?? "neutral"}>{STATUS_NAAM[b.status] ?? b.status}</Pill>
                  <NieuwsBerichtKnoppen slug={b.slug} status={b.status} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
