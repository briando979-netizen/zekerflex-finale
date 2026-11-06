import { getPrincipal, hasRole } from "@/lib/auth";
import { KpiStrip, PageHead, Panel, Pill } from "@/components/admin/kit";
import { GratisAi } from "@/components/admin/GratisAi";
import { GRATIS_STATUS_LABEL, GRATIS_STATUS_TINT } from "@/lib/gratis/diensten";
import { dienstenStand, telling } from "@/lib/gratis/status";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Admin → Alles gratis. Eén overzicht van elke dienst van buiten waar het
// platform nog van afhangt, met ons eigen alternatief ernaast. De AI kun je
// hier met één knop naar onze eigen server zetten.
// ---------------------------------------------------------------------------

export default async function GratisPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="Dit overzicht is alleen voor platformbeheerders." />;
  }

  const { diensten } = await dienstenStand();
  const t = telling(diensten);

  return (
    <div>
      <PageHead
        title="Alles gratis"
        subtitle="Wat draait al op onze eigen server, wat kan er nu over, en wat moeten we nog zelf bouwen. Sleutels zelf staan hier nooit — alleen of er één klaarstaat."
      />

      <KpiStrip
        items={[
          { label: "Draait al gratis", value: String(t.gratis), tone: "ok", hint: "op onze eigen server of gewoon kosteloos" },
          { label: "Nu om te zetten", value: String(t.schakelbaar), tone: "plan", hint: "met een knop, zonder uitrol" },
          { label: "Zelf te bouwen", value: String(t.bouwen), tone: "warn", hint: "eigen alternatief nog te maken" },
          { label: "Kost nu geld", value: String(t.kost), tone: t.kost > 0 ? "money" : "ok", hint: "sleutel staat klaar en wordt gebruikt" },
        ]}
      />

      <div className="mt-4 space-y-4">
        <Panel title="De AI zelf" subtitle="De grootste kostenpost: elke vraag aan een betaald model kost geld per keer.">
          <GratisAi />
        </Panel>

        <Panel title="Alle diensten van buiten" subtitle={`${diensten.length} diensten, met ons eigen alternatief ernaast.`}>
          <ul className="space-y-3">
            {diensten.map((d) => (
              <li
                key={d.id}
                className="rounded-xl p-3 sm:p-4"
                style={{ background: "var(--a-elev)", border: "1px solid var(--a-border)" }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold" style={{ color: "var(--a-text)" }}>
                    {d.naam}
                  </h3>
                  <div className="flex flex-wrap items-center gap-2">
                    {d.kostNu && <Pill tone="money">Kost nu geld</Pill>}
                    <Pill tone={GRATIS_STATUS_TINT[d.status]}>{GRATIS_STATUS_LABEL[d.status]}</Pill>
                  </div>
                </div>
                <p className="mt-1 text-xs" style={{ color: "var(--a-mute)" }}>
                  {d.waarvoor}
                </p>
                <dl className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                  <div>
                    <dt className="font-medium" style={{ color: "var(--a-dim)" }}>
                      Nu
                    </dt>
                    <dd style={{ color: "var(--a-text)" }}>{d.nu}</dd>
                  </div>
                  <div>
                    <dt className="font-medium" style={{ color: "var(--a-dim)" }}>
                      Van ons zelf
                    </dt>
                    <dd style={{ color: "var(--a-text)" }}>{d.eigen}</dd>
                  </div>
                </dl>
                {d.env?.length ? (
                  <p className="mt-2 text-[0.6875rem]" style={{ color: "var(--a-mute)" }}>
                    Instellingen: {d.env.join(", ")} — {d.sleutel ? "staat klaar" : "staat niet ingesteld"}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
