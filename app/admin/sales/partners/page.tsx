import Link from "next/link";
import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHead, Panel } from "@/components/admin/kit";
import { PartnerCampagnesKnop } from "@/components/admin/sales/PartnerCampagnes";
import { partnerStand } from "@/lib/sales/partner-campagnes";

export const dynamic = "force-dynamic";

// Partnercampagnes (18 nov 2026): mails aan organisaties die ZekerFlex iets kunnen geven wat het zelf niet heeft, in plaats van aan
// klanten. Een campagne per soort, met een vaste eerlijke tekst; alles begint als concept (lib/sales/partner-soorten.ts).

const STATUS: Record<string, string> = { DRAFT: "concept, nog niet actief", ACTIVE: "actief", PAUSED: "gepauzeerd", DONE: "afgerond" };
const MODE: Record<string, string> = { REVIEW: "jij verstuurt elke mail zelf", AUTOPILOT: "automatisch versturen" };

export default async function PartnerCampagnesPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="Dit overzicht is alleen zichtbaar voor platformbeheerders." />;
  }
  const soorten = await partnerStand().catch(() => []);
  const allemaal = soorten.length > 0 && soorten.every((s) => s.campagneId !== null);

  return (
    <div className="space-y-4">
      <PageHead
        title="Partnercampagnes"
        subtitle="Mails aan uitzendbureaus, verzekeraars en administratiekantoren: organisaties die ZekerFlex iets kunnen geven wat het zelf niet heeft. Alles begint als concept: er gaat niets uit voor jij een campagne actief zet en elke mail zelf verstuurt."
        actions={
          <Link href="/admin/sales" className="text-xs underline" style={{ color: "var(--a-mute)" }}>
            Naar Sales
          </Link>
        }
      />
      <Panel title="Hoe het werkt" subtitle="Dezelfde verkoopmotor als voor klanten, met een eigen tekst per soort.">
        <ol className="list-decimal space-y-1.5 pl-5 text-sm" style={{ color: "var(--a-text)" }}>
          <li>Druk op de knop: er komt een campagne per soort, elk met een vaste tekst die je kunt lezen en aanpassen.</li>
          <li>De motor zoekt organisaties in OpenStreetMap en zet per organisatie een conceptmail klaar. Hooguit 10 per dag per soort.</li>
          <li>Jij leest elk concept en drukt zelf op &quot;Verstuur nu&quot;. Zet je een campagne later op automatisch versturen, dan is dat jouw eigen keuze.</li>
          <li>Antwoordt een organisatie, dan krijg je een melding en stopt de reeks. Er wordt nooit automatisch teruggeschreven.</li>
        </ol>
        <p className="mt-3 text-xs" style={{ color: "var(--a-mute)" }}>
          In de teksten staat niets over prijs, marge of voorwaarden, en niets over klanten die er nog niet zijn.
        </p>
        <div className="mt-4">
          <PartnerCampagnesKnop allemaalAanwezig={allemaal} />
        </div>
      </Panel>
      <Panel title="De drie soorten" flush>
        <ul className="divide-y" style={{ borderColor: "var(--a-border)" }}>
          {soorten.map((s) => (
            <li key={s.id} className="grid gap-1 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-4 sm:px-5">
              <div className="min-w-0">
                <p className="text-sm font-semibold" style={{ color: "var(--a-text)" }}>{s.label}</p>
                <p className="mt-0.5 text-xs" style={{ color: "var(--a-mute)" }}>{s.waarom}</p>
              </div>
              <div className="text-xs sm:text-right" style={{ color: "var(--a-mute)" }}>
                {s.campagneId ? (
                  <>
                    <p className="font-semibold" style={{ color: "var(--a-text)" }}>
                      {STATUS[s.status ?? ""] ?? s.status} · {MODE[s.mode ?? ""] ?? s.mode}
                    </p>
                    <Link href={`/admin/sales/campagne/${s.campagneId}`} className="mt-1 inline-block underline">
                      Tekst en campagne bekijken
                    </Link>
                  </>
                ) : (
                  <p>nog niet aangemaakt</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
