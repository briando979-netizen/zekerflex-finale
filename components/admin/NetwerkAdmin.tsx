import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { KpiStrip, Notice, PageHead, Panel, Pill, type Tone } from "@/components/admin/kit";
import { DataTable, type TableRow } from "@/components/admin/kit-client";
import { MODULES, MODULE_DEFS, STATUS_LABEL, euro, type ModuleStatus } from "@/lib/netwerk/modules";
import { alleStanden } from "@/lib/netwerk/store";
import { bedragVan, moduleLeverbaar } from "@/lib/netwerk/abonnement";
import { vpnAdres } from "@/lib/netwerk/headscale";
import { env } from "@/lib/env";

// ---------------------------------------------------------------------------
// Admin → Verbinding: alle bedrijven met een netwerkpakket (lib/netwerk),
// de maandomzet, de aanvragen die een mens moet oppakken (5G, wachtlijst) en
// of de servers erachter (RADIUS voor wifi, Headscale voor de VPN) draaien.
// ---------------------------------------------------------------------------

const TONE: Record<ModuleStatus, Tone> = { aangevraagd: "warn", "wacht-op-betaling": "warn", actief: "ok", opgezegd: "neutral" };

const MAANDEN = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
function datum(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "numeric", year: "numeric" }).formatToParts(d);
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${v("day")} ${MAANDEN[Number(v("month")) - 1] ?? ""} ${v("year")}`;
}

export async function NetwerkAdmin() {
  const standen = await alleStanden();
  const tenants = await prisma.tenant.findMany({ where: { id: { in: standen.map((s) => s.tenantId) } }, select: { id: true, name: true } });
  const naamVan = new Map(tenants.map((t) => [t.id, t.name]));

  let actief = 0;
  let wacht = 0;
  let omzet = 0;
  const rows: TableRow[] = [];
  for (const { tenantId, stand } of standen) {
    const naam = naamVan.get(tenantId) ?? tenantId;
    let bedrag = 0;
    const cells: Record<string, React.ReactNode> = {
      bedrijf: (
        <Link href={`/admin/bedrijven/${tenantId}`} className="font-medium" style={{ color: "var(--a-text)" }}>
          {naam}
        </Link>
      ),
    };
    const filters: Record<string, string> = {};
    let laatst = "";
    for (const sleutel of MODULES) {
      const m = stand.modules[sleutel];
      if (!m) {
        cells[sleutel] = <span style={{ color: "var(--a-mute)" }}>—</span>;
        continue;
      }
      if (m.status === "actief") actief++;
      if (m.status === "aangevraagd" || m.status === "wacht-op-betaling") wacht++;
      bedrag += bedragVan(sleutel, m);
      filters[sleutel] = m.status;
      if (m.sinds > laatst) laatst = m.sinds;
      cells[sleutel] = (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <Pill tone={TONE[m.status]}>{STATUS_LABEL[m.status]}</Pill>
          <span className="text-xs" style={{ color: "var(--a-mute)" }}>
            {sleutel === "vpn" && m.variant === "onbeperkt" ? "onbeperkt" : `${m.aantal} ${m.aantal === 1 ? MODULE_DEFS[sleutel].eenheidLabel.een : MODULE_DEFS[sleutel].eenheidLabel.meer}`}
            {m.gratis ? " · gratis" : ""}
          </span>
        </span>
      );
    }
    omzet += bedrag;
    cells.bedrag = euro(bedrag);
    cells.laatst = laatst ? datum(laatst) : "";
    rows.push({ id: tenantId, cells, sort: { bedrijf: naam, bedrag, laatst }, search: naam, filters, csv: { bedrijf: naam, bedrag: bedrag / 100, laatst } });
  }

  const wifiKlaar = moduleLeverbaar("wifi");
  const vpnKlaar = moduleLeverbaar("vpn");
  const statusOpties = (Object.keys(STATUS_LABEL) as ModuleStatus[]).map((s) => ({ value: s, label: STATUS_LABEL[s] }));

  return (
    <>
      <PageHead title="Verbinding: wifi, VPN en 5G" subtitle="Netwerkpakketten op de eigen server: wie wat heeft, wat het oplevert en of de servers erachter draaien." />
      <KpiStrip
        items={[
          { label: "Actieve pakketten", value: String(actief), tone: actief > 0 ? "ok" : "neutral" },
          { label: "Wacht op jou of op betaling", value: String(wacht), tone: wacht > 0 ? "warn" : "neutral", hint: "aanvragen 5G, wachtlijst, onbetaald" },
          { label: "Per maand", value: euro(omzet), tone: "money", hint: "exclusief btw, zonder kosteloze accounts" },
          { label: "Bedrijven", value: String(standen.length) },
        ]}
      />
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <Notice tone={wifiKlaar ? "ok" : "warn"}>
          <strong>Wifi (RADIUS):</strong>{" "}
          {wifiKlaar
            ? `gekoppeld; klanten zetten ${env.NETWERK_RADIUS_HOST} (UDP 1812) in hun wifi-apparatuur.`
            : "nog niet ingericht (NETWERK_RADIUS_TOKEN ontbreekt). Klanten kunnen zich alvast op de lijst zetten; betalen kan pas als de server draait."}
        </Notice>
        <Notice tone={vpnKlaar ? "ok" : "warn"}>
          <strong>VPN (Headscale):</strong> {vpnKlaar ? `gekoppeld op ${vpnAdres()}.` : "nog niet gekoppeld (HEADSCALE_URL en HEADSCALE_API_KEY ontbreken). Zie Admin → Te doen."}
        </Notice>
      </div>
      <Panel title="Bedrijven met een pakket" subtitle="Per pakket de stand; 5G is altijd een aanvraag die een mens oppakt (de lead staat in de pijplijn)." className="mt-4">
        <DataTable
          columns={[
            { key: "bedrijf", label: "Bedrijf", sortable: true },
            { key: "wifi", label: MODULE_DEFS.wifi.naam },
            { key: "vpn", label: MODULE_DEFS.vpn.naam, hideOnMobile: true },
            { key: "5g", label: MODULE_DEFS["5g"].naam, hideOnMobile: true },
            { key: "bedrag", label: "Per maand", align: "right", sortable: true },
            { key: "laatst", label: "Laatste wijziging", hideOnMobile: true, sortable: true },
          ]}
          rows={rows}
          filters={[
            { key: "wifi", label: "Wifi", options: statusOpties },
            { key: "vpn", label: "VPN", options: statusOpties },
            { key: "5g", label: "5G", options: statusOpties },
          ]}
          searchPlaceholder="Zoek een bedrijf"
          csvName="netwerkpakketten"
          emptyText="Nog geen bedrijf met een netwerkpakket."
          defaultSort={{ key: "laatst", dir: "desc" }}
        />
      </Panel>
      <Panel title="De pakketten" subtitle="Prijzen uit het prijsvoorstel van 5 november 2026 (lib/netwerk/modules.ts)." className="mt-4">
        <ul className="grid gap-3 text-sm md:grid-cols-3">
          {MODULES.map((s) => (
            <li key={s} className="rounded-lg p-3" style={{ background: "var(--a-page)" }}>
              <p className="font-semibold" style={{ color: "var(--a-text)" }}>
                {MODULE_DEFS[s].naam}
              </p>
              <p className="text-xs" style={{ color: "var(--a-mute)" }}>
                {MODULE_DEFS[s].ookBekendAls} · {MODULE_DEFS[s].prijsTekst}
              </p>
              <p className="mt-1 text-xs" style={{ color: "var(--a-dim)" }}>
                {MODULE_DEFS[s].kort}
              </p>
            </li>
          ))}
        </ul>
      </Panel>
    </>
  );
}
