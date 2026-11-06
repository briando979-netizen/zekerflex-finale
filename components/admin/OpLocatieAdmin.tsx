import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { KpiStrip, Notice, PageHead, Panel, Pill } from "@/components/admin/kit";
import { DataTable, type TableRow } from "@/components/admin/kit-client";
import { MODULES, MODULE_DEFS, MODULE_LIJST, type ModuleSleutel } from "@/lib/locatie/modules";
import { alleStanden } from "@/lib/locatie/store";
import { toegangLog, vestigingToegang, kastjeStatus, type VestigingToegang } from "@/lib/locatie/toegang";
import { kluisItems } from "@/lib/locatie/kluis";
import { printAgent, agentStatus, wachtrij } from "@/lib/locatie/printen";

// ---------------------------------------------------------------------------
// Admin → Op locatie: welke bedrijven welke module aan hebben, hoeveel het
// gebruikt wordt (aankomsten, kluisitems, labels), of de kastjes en printagents
// leven, en wat de eigenaar nog moet beslissen (prijzen: Te doen).
// ---------------------------------------------------------------------------

const MAANDEN = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
function datum(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "numeric", year: "numeric" }).formatToParts(d);
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${v("day")} ${MAANDEN[Number(v("month")) - 1] ?? ""} ${v("year")}`;
}

export async function OpLocatieAdmin() {
  const standen = await alleStanden();
  const tenants = await prisma.tenant.findMany({ where: { id: { in: standen.map((s) => s.tenantId) } }, select: { id: true, name: true } });
  const naamVan = new Map(tenants.map((t) => [t.id, t.name]));
  const sinds24u = new Date(Date.now() - 24 * 3_600_000).toISOString();

  const perModule: Record<ModuleSleutel, number> = { portofoon: 0, toegang: 0, kluis: 0, printen: 0 };
  let aankomsten = 0;
  let kastjesOnline = 0;
  let kastjesOffline = 0;
  let labelsWacht = 0;
  const rows: TableRow[] = [];

  for (const stand of standen) {
    const naam = naamVan.get(stand.tenantId) ?? stand.tenantId;
    const aan = MODULES.filter((m) => stand.modules[m]?.aan);
    for (const m of aan) perModule[m]++;
    const [log, vest, items, rij, agent] = await Promise.all([
      stand.modules.toegang?.aan ? toegangLog(stand.tenantId, 500) : Promise.resolve([]),
      stand.modules.toegang?.aan ? vestigingToegang(stand.tenantId) : Promise.resolve<Record<string, VestigingToegang>>({}),
      stand.modules.kluis?.aan ? kluisItems(stand.tenantId) : Promise.resolve([]),
      stand.modules.printen?.aan ? wachtrij(stand.tenantId, 400) : Promise.resolve([]),
      stand.modules.printen?.aan ? printAgent(stand.tenantId) : Promise.resolve(null),
    ]);
    const recent = log.filter((e) => e.at >= sinds24u && e.bron === "camera").length;
    aankomsten += recent;
    for (const v of Object.values(vest)) {
      const st = kastjeStatus(v);
      if (st === "online") kastjesOnline++;
      else if (st === "offline") kastjesOffline++;
    }
    const wacht = rij.filter((o) => o.status === "wacht").length;
    labelsWacht += wacht;
    const ag = agentStatus(agent);
    const laatst = Object.values(stand.modules)
      .map((m) => m?.sinds ?? "")
      .sort()
      .at(-1) ?? "";
    const cells: Record<string, React.ReactNode> = {
      bedrijf: (
        <Link href={`/admin/bedrijven/${stand.tenantId}`} className="font-medium" style={{ color: "var(--a-text)" }}>
          {naam}
        </Link>
      ),
      modules: (
        <span className="flex flex-wrap gap-1">
          {MODULES.map((m) => (
            <Pill key={m} tone={stand.modules[m]?.aan ? "ok" : "neutral"} dot={false}>
              {MODULE_DEFS[m].naam.split(" ")[0]}
            </Pill>
          ))}
        </span>
      ),
      gebruik: (
        <span style={{ color: "var(--a-mute)" }}>
          {stand.modules.toegang?.aan ? `${recent} aankomsten (24 u)` : ""}
          {stand.modules.kluis?.aan ? `${stand.modules.toegang?.aan ? " · " : ""}${items.length} kluisitems` : ""}
          {stand.modules.printen?.aan ? `${stand.modules.toegang?.aan || stand.modules.kluis?.aan ? " · " : ""}${wacht} labels wachten` : ""}
          {aan.length === 0 ? "alles uit" : ""}
        </span>
      ),
      apparaten: (
        <span className="flex flex-wrap gap-1">
          {Object.values(vest).map((v, i) => (
            <Pill key={`k${i}`} tone={kastjeStatus(v) === "online" ? "ok" : kastjeStatus(v) === "offline" ? "crit" : "neutral"}>
              kastje {kastjeStatus(v) === "geen-token" ? "zonder token" : kastjeStatus(v)}
            </Pill>
          ))}
          {stand.modules.printen?.aan && <Pill tone={ag === "online" ? "ok" : ag === "offline" ? "crit" : "neutral"}>printagent {ag === "geen" ? "geen" : ag}</Pill>}
        </span>
      ),
      laatst: laatst ? datum(laatst) : "",
    };
    rows.push({
      id: stand.tenantId,
      cells,
      sort: { bedrijf: naam, laatst, aantal: aan.length },
      search: `${naam} ${aan.join(" ")}`,
      filters: Object.fromEntries(MODULES.map((m) => [m, stand.modules[m]?.aan ? "aan" : "uit"])),
    });
  }

  const bedrijvenAan = standen.filter((s) => MODULES.some((m) => s.modules[m]?.aan)).length;
  const optiesAanUit = [
    { value: "aan", label: "Aan" },
    { value: "uit", label: "Uit" },
  ];

  return (
    <>
      <PageHead title="Op locatie: portofoon, toegang, kluis, printen" subtitle="Vier modules voor de werkvloer op de eigen server (lib/locatie): wie wat aan heeft, hoe het gebruikt wordt en of de apparaten op locatie leven." />
      <KpiStrip
        items={[
          { label: "Bedrijven met een module aan", value: String(bedrijvenAan), tone: bedrijvenAan > 0 ? "ok" : "neutral", hint: `${standen.length} bedrijven keken ernaar` },
          { label: "Aankomsten op kenteken (24 u)", value: String(aankomsten), tone: aankomsten > 0 ? "ok" : "neutral" },
          { label: "Kastjes bij slagbomen", value: `${kastjesOnline} online`, tone: kastjesOffline > 0 ? "warn" : kastjesOnline > 0 ? "ok" : "neutral", hint: kastjesOffline ? `${kastjesOffline} offline` : "" },
          { label: "Labels in wachtrijen", value: String(labelsWacht), tone: labelsWacht > 0 ? "plan" : "neutral" },
        ]}
      />
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <Panel title="Per module" subtitle="Hoeveel bedrijven elke module aan hebben.">
          <ul className="divide-y" style={{ borderColor: "var(--a-line)" }}>
            {MODULE_LIJST.map((def) => (
              <li key={def.sleutel} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span>
                  <span className="font-medium" style={{ color: "var(--a-text)" }}>
                    {def.naam}
                  </span>
                  <span className="ml-2 text-xs" style={{ color: "var(--a-mute)" }}>
                    {def.ookBekendAls} · {def.techniek}
                  </span>
                </span>
                <Pill tone={perModule[def.sleutel] > 0 ? "ok" : "neutral"}>{perModule[def.sleutel]} aan</Pill>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Wat jij nog beslist" subtitle="De modules werken; de prijs is nog 'op aanvraag'.">
          <Notice tone="warn">
            Elke eerste activering bij een betalend bedrijf komt als lead in de pijplijn (bron locatie-…). Bepaal de prijzen onder{" "}
            <Link href="/admin/te-doen" className="underline">
              Te doen
            </Link>
            ; dan kan het, zoals de netwerkpakketten, via een abonnement lopen. De apparatuur voor de eerste klant (kastje, labelprinter) staat daar ook.
          </Notice>
          <p className="mt-3 text-xs" style={{ color: "var(--a-mute)" }}>
            Openbare pagina&apos;s: /aanbod/portofoon-in-de-app, /aanbod/toegang-op-kenteken, /aanbod/sleutelkluis, /aanbod/badges-en-labels-printen. Uit te zetten zonder uitrol via Systeem → Schakelaars (locatie-modules).
          </p>
        </Panel>
      </div>
      <div className="mt-4">
        <DataTable
          columns={[
            { key: "bedrijf", label: "Bedrijf", sortable: true },
            { key: "modules", label: "Modules" },
            { key: "gebruik", label: "Gebruik", hideOnMobile: true },
            { key: "apparaten", label: "Apparaten op locatie", hideOnMobile: true },
            { key: "laatst", label: "Laatste wijziging", hideOnMobile: true, sortable: true },
          ]}
          rows={rows}
          filters={MODULES.map((m) => ({ key: m, label: MODULE_DEFS[m].naam, options: optiesAanUit }))}
          searchPlaceholder="Zoek een bedrijf"
          csvName="op-locatie"
          emptyText="Nog geen bedrijf heeft een module aangezet."
          defaultSort={{ key: "laatst", dir: "desc" }}
        />
      </div>
    </>
  );
}
