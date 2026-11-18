import Link from "next/link";
import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHead, KpiStrip, Panel } from "@/components/admin/kit";
import { MelderInstellingen } from "@/components/admin/MelderInstellingen";
import { leesGebeurtenissen, leesInstelling } from "@/lib/ops/melder";
import { BEWAAR_DAGEN, DIRECT_PER_UUR, SOORTEN, toonNummer } from "@/lib/ops/gebeurtenis";
import { liveStand } from "@/lib/whatsapp/brug";

export const dynamic = "force-dynamic";

// Automatisch gedaan (18 nov 2026): het logboek van alles wat ZekerFlex zelf doet en de instellingen van de meldingen naar de
// telefoon van de eigenaar (lib/ops/melder.ts). Geen namen, e-mailadressen of chatinhoud: alleen wat er gebeurde.

const wanneer = (iso: string) => new Date(iso).toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" });

const GEMELD: Record<string, string> = { direct: "direct gemeld", samenvatting: "in het uurbericht", wacht: "wacht op het uurbericht" };

export default async function AutomatischGedaanPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="Dit overzicht is alleen zichtbaar voor platformbeheerders." />;
  }
  const [instelling, gebeurtenissen, brug] = await Promise.all([leesInstelling(), leesGebeurtenissen(300), liveStand().catch(() => null)]);
  const sinds = Date.now() - 24 * 3_600_000;
  const laatsteDag = gebeurtenissen.filter((g) => Date.parse(g.at) > sinds);
  const wacht = gebeurtenissen.filter((g) => g.gemeld === "wacht").length;
  const kanaal = brug?.verbonden && instelling.whatsapp ? "WhatsApp" : "melding in de app";

  return (
    <div className="space-y-4">
      <PageHead
        title="Automatisch gedaan"
        subtitle="Wat ZekerFlex zelf heeft gedaan: aanmeldingen, bestellingen, klussen, demo's, verkoopmails en meer. Belangrijke dingen komen direct op je telefoon, de rest in één bericht per uur."
        actions={
          <Link href="/admin/zekerflex-ai/medewerkers" className="text-xs underline" style={{ color: "var(--a-mute)" }}>
            Naar de AI-medewerkers
          </Link>
        }
      />
      <KpiStrip
        items={[
          { label: "Laatste 24 uur", value: laatsteDag.length, hint: "gebeurtenissen" },
          { label: "Wachten op het uurbericht", value: wacht },
          { label: "Meldingen", value: instelling.aan ? "aan" : "uit", hint: `via ${kanaal}` },
          { label: "Nummer", value: toonNummer(instelling.telefoon), hint: brug?.verbonden ? "WhatsApp gekoppeld" : "WhatsApp niet gekoppeld", href: "/admin/whatsapp" },
        ]}
      />
      <Panel title="Meldingen naar je telefoon" subtitle={`Direct: hoogstens ${DIRECT_PER_UUR} per uur en alleen tussen 07:00 en 23:00. Wat daarbuiten valt, komt in het eerstvolgende uurbericht.`}>
        <MelderInstellingen aan={instelling.aan} telefoon={instelling.telefoon ? toonNummer(instelling.telefoon) : ""} whatsapp={instelling.whatsapp} brugVerbonden={Boolean(brug?.verbonden)} />
      </Panel>
      <Panel title="Het logboek" subtitle={`De laatste ${gebeurtenissen.length} gebeurtenissen, ${BEWAAR_DAGEN} dagen bewaard. Zonder namen, e-mailadressen of chatinhoud.`} flush>
        {gebeurtenissen.length === 0 ? (
          <p className="px-4 py-6 text-sm sm:px-5" style={{ color: "var(--a-mute)" }}>
            Nog niets vastgelegd. Zodra er een aanmelding, bestelling of klus komt, staat het hier.
          </p>
        ) : (
          <ul className="divide-y" style={{ borderColor: "var(--a-border)" }}>
            {gebeurtenissen.map((g) => (
              <li key={`${g.at}-${g.id}`} className="grid gap-1 px-4 py-2.5 sm:grid-cols-[9rem_minmax(0,1fr)_auto] sm:gap-4 sm:px-5">
                <span className="text-xs tabular-nums" style={{ color: "var(--a-mute)" }}>{wanneer(g.at)}</span>
                <span className="min-w-0 text-sm" style={{ color: "var(--a-text)" }}>
                  <span aria-hidden="true">{SOORTEN[g.soort].icoon} </span>
                  {g.titel}
                  {g.detail && <span className="block text-xs" style={{ color: "var(--a-mute)" }}>{g.detail}</span>}
                </span>
                <span className="text-xs sm:text-right" style={{ color: "var(--a-dim)" }}>
                  {GEMELD[g.gemeld]}
                  {g.url && (
                    <>
                      {" · "}
                      <Link href={g.url} className="underline">
                        Bekijken
                      </Link>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
