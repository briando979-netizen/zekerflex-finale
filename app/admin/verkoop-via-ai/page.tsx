import { getPrincipal, hasRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { SITE } from "@/lib/seo";
import { featureEnabled } from "@/lib/flags";
import { agentBestellingen, agentStand, type FeedStand } from "@/lib/shop/agent-handel-server";
import { IMPORT_STATUS_NL } from "@/lib/shop/agent-handel";
import { count, dateTimeNl, euro } from "@/lib/admin/format";
import { KpiStrip, NameCell, Notice, PageHead, Panel, Pill } from "@/components/admin/kit";
import { DataTable, type TableRow } from "@/components/admin/kit-client";
import { AgentCatalogusKnop } from "@/components/admin/AgentCatalogusKnop";

export const dynamic = "force-dynamic";

// Verkopen via AI-assistenten: de webshop via Stripe (Agentic Commerce Suite,
// lib/shop/agent-handel-server.ts) en reserveren bij horecazaken via onze eigen
// API (/api/agent/horeca). Hier staat hoe ver het is en wat nog bij Stripe moet.

const SOORT: Record<string, string> = { product: "Hele productlijst", inventory: "Voorraad", pricing: "Prijzen" };

const UITSLAG: Record<string, string> = {
  uit: "Staat uit (vlag)",
  "geen-sleutel": "Geen Stripe-sleutel",
  "wacht-na-fout": "Wacht na een fout",
  "niets-veranderd": "Niets veranderd",
  productlijst: "Hele lijst verstuurd",
  "voorraad-en-prijs": "Voorraad of prijs verstuurd",
  fout: "Mislukt",
};

function feedRij(soort: string, f: FeedStand | undefined): TableRow {
  const s = f ? (IMPORT_STATUS_NL[f.status] ?? { label: f.status, tone: "neutral" as const }) : { label: "Nog niet verstuurd", tone: "neutral" as const };
  return {
    id: soort,
    cells: {
      soort: <NameCell name={SOORT[soort] ?? soort} sub={f ? `${count(f.regels)} regels` : "—"} />,
      stand: <Pill tone={s.tone}>{s.label}</Pill>,
      gelukt: f?.gelukt !== undefined ? count(f.gelukt) : "—",
      fouten: f?.fouten ? <Pill tone="warn">{count(f.fouten)}</Pill> : "—",
      op: f ? dateTimeNl(f.op) : "—",
    },
    sort: { soort, stand: f?.status ?? "", gelukt: f?.gelukt ?? 0, fouten: f?.fouten ?? 0, op: f ? Date.parse(f.op) : 0 },
    csv: { soort: SOORT[soort] ?? soort, stand: s.label, gelukt: f?.gelukt ?? "", fouten: f?.fouten ?? "", op: f?.op ?? "" },
  };
}

export default async function VerkoopViaAiPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="Dit overzicht is alleen voor platformbeheerders." />;
  }
  const dertig = new Date(Date.now() - 30 * 86_400_000);
  const [stand, winkelAan, horecaAan, merken, zakenOnline, agentBoekingen] = await Promise.all([
    agentStand(),
    featureEnabled("agent-winkel"),
    featureEnabled("agent-horeca"),
    agentBestellingen(50),
    prisma.horecaZaak.count({ where: { online: true, modules: { has: "reserveren" } } }),
    prisma.horecaReservering.findMany({ where: { bron: "agent", createdAt: { gte: dertig } }, select: { id: true, datum: true, tijd: true, personen: true, status: true, createdAt: true, zaak: { select: { naam: true } } }, orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  const orders = merken.length ? await prisma.shopOrder.findMany({ where: { id: { in: merken.map((m) => m.orderId) } }, select: { id: true, firstName: true, lastName: true, city: true, totalCents: true, status: true, createdAt: true } }) : [];
  const orderVan = new Map(orders.map((o) => [o.id, o]));
  const heeftSleutel = Boolean(env.STRIPE_SECRET_KEY);
  const voorbeelden = [stand.product, stand.inventory, stand.pricing].flatMap((f) => f?.voorbeelden ?? []).slice(0, 10);
  const meldingen = [stand.product, stand.inventory, stand.pricing].map((f) => f?.melding).filter((m): m is string => Boolean(m));

  const bestelRijen: TableRow[] = merken.map((m) => {
    const o = orderVan.get(m.orderId);
    const naam = o ? `${o.firstName} ${o.lastName}`.trim() || "Onbekend" : "Bestelling niet gevonden";
    return {
      id: m.orderId,
      search: `${naam} ${o?.city ?? ""} ${m.orderId}`,
      cells: {
        klant: <NameCell name={naam} sub={`${o?.city || "—"} · bestelling ${m.orderId.slice(-8)}`} />,
        bedrag: euro(m.totaalCent),
        stand: <Pill tone={o?.status === "SHIPPED" ? "ok" : "warn"}>{o?.status === "SHIPPED" ? "Verstuurd" : o?.status === "CANCELLED" ? "Geannuleerd" : "Te versturen"}</Pill>,
        op: dateTimeNl(m.op),
      },
      sort: { klant: naam, bedrag: m.totaalCent, stand: o?.status ?? "", op: Date.parse(m.op) },
      csv: { klant: naam, plaats: o?.city ?? "", bedrag: (m.totaalCent / 100).toFixed(2), op: m.op, bestelling: m.orderId },
    };
  });

  const boekRijen: TableRow[] = agentBoekingen.map((r) => ({
    id: r.id,
    search: r.zaak.naam,
    cells: {
      zaak: <NameCell name={r.zaak.naam} sub={`${r.personen} ${r.personen === 1 ? "persoon" : "personen"}`} />,
      wanneer: `${r.datum.split("-").reverse().join("-")} om ${r.tijd}`,
      stand: <Pill tone={r.status === "GEANNULEERD" ? "neutral" : r.status === "NIET_GEKOMEN" ? "crit" : "ok"}>{r.status === "GEANNULEERD" ? "Geannuleerd" : r.status === "NIET_GEKOMEN" ? "Niet gekomen" : r.status === "AANGEKOMEN" ? "Gekomen" : "Bevestigd"}</Pill>,
      geboekt: dateTimeNl(r.createdAt),
    },
    sort: { zaak: r.zaak.naam, wanneer: `${r.datum} ${r.tijd}`, stand: r.status, geboekt: r.createdAt.getTime() },
    csv: { zaak: r.zaak.naam, datum: r.datum, tijd: r.tijd, personen: r.personen, stand: r.status, geboekt: r.createdAt.toISOString() },
  }));

  return (
    <div className="space-y-4">
      <PageHead
        title="Verkoop via AI"
        subtitle="AI-assistenten zoals ChatGPT, Copilot en Perplexity kunnen namens iemand in de webshop kopen (via Stripe) en een tafel reserveren bij horecazaken (via onze eigen API)."
      />

      {!winkelAan && <Notice tone="warn">De webshop via AI-assistenten staat uit (Systeem → Vlaggen: &quot;Webshop via AI-assistenten&quot;). Er gaat niets naar Stripe.</Notice>}
      {!heeftSleutel && <Notice tone="crit">Er staat geen Stripe-sleutel op de server; de productlijst kan niet naar Stripe.</Notice>}
      {stand.fout && (
        <Notice tone="crit" role="alert">
          Laatste fout ({dateTimeNl(stand.fout.op)}, poging {stand.fout.pogingen}): {stand.fout.bericht} De volgende poging is rond {dateTimeNl(stand.fout.volgende)}, of druk op de knop.
        </Notice>
      )}

      <KpiStrip
        items={[
          { label: "Producten in de lijst", value: count(stand.regels ?? 0), hint: "elke maat en kleur apart" },
          { label: "Bewust niet in de lijst", value: count(stand.overgeslagen?.length ?? 0), hint: "zie hieronder waarom" },
          { label: "Bestellingen via AI", value: count(merken.length), hint: "in totaal", tone: "money" },
          { label: "Tafels via AI", value: count(agentBoekingen.length), hint: `laatste 30 dagen, ${count(zakenOnline)} zaken boekbaar` },
        ]}
      />

      <Panel
        flush
        title="Webshop: productlijst bij Stripe"
        subtitle={`Elk kwartier gecontroleerd; alleen wat veranderde gaat naar Stripe. Laatste ronde: ${stand.laatsteRonde ? `${dateTimeNl(stand.laatsteRonde)} (${UITSLAG[stand.laatsteUitslag ?? ""] ?? "—"})` : "nog niet"}.`}
        actions={<AgentCatalogusKnop />}
      >
        <DataTable
          columns={[
            { key: "soort", label: "Wat" },
            { key: "stand", label: "Stand bij Stripe" },
            { key: "gelukt", label: "Gelukt", align: "right", hideOnMobile: true },
            { key: "fouten", label: "Fouten", align: "right" },
            { key: "op", label: "Verstuurd", hideOnMobile: true },
          ]}
          rows={[feedRij("product", stand.product), feedRij("inventory", stand.inventory), feedRij("pricing", stand.pricing)]}
          csvName="productlijst-stripe"
          emptyText="Nog niets verstuurd."
        />
      </Panel>

      {(voorbeelden.length > 0 || meldingen.length > 0) && (
        <Panel title="Wat Stripe afkeurde" subtitle="De tekst van Stripe is Engels; per regel staat welk product en welk veld.">
          <ul className="space-y-1.5 text-sm">
            {meldingen.map((m) => (
              <li key={m}>{m}</li>
            ))}
            {voorbeelden.map((v) => (
              <li key={`${v.id}-${v.veld}-${v.regel}`}>
                Regel {v.regel}, veld <code>{v.veld || "?"}</code> (variant {v.id}): {v.bericht}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {(stand.overgeslagen?.length ?? 0) > 0 && (
        <Panel title="Niet in de lijst" subtitle="Deze producten staan in de webshop, maar gaan bewust niet naar Stripe.">
          <ul className="space-y-1 text-sm">
            {stand.overgeslagen?.map((o) => (
              <li key={`${o.naam}-${o.reden}`}>
                {o.naam}: <span style={{ color: "var(--a-dim)" }}>{o.reden}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel title="Wat jij nog doet in Stripe" subtitle="Eenmalig, in het Stripe-dashboard. Pas daarna zien AI-assistenten de producten en kunnen ze afrekenen.">
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li>
            Ga naar <strong>dashboard.stripe.com/agentic-commerce</strong> en kies bij &quot;Agentic commerce for retail&quot; <strong>Get started</strong>, als verkoper.
          </li>
          <li>
            Vul het Stripe-profiel in met de voorwaarden ({SITE.url}/voorwaarden), de privacyverklaring ({SITE.url}/privacy) en het retourbeleid (30 dagen retour, zoals in de shop).
          </li>
          <li>Zet de btw goed: Instellingen → Belastingen, Nederland als registratie met het btw-nummer. De prijzen in de lijst zijn inclusief btw.</li>
          <li>
            Kijk bij <strong>Feed history</strong> of de productlijst binnen is (de knop hierboven stuurt hem meteen). Test een product met <strong>View feed → Test</strong>.
          </li>
          <li>
            Kies per AI-assistent <strong>⋯ → Request connection</strong>. Pas als de assistent het goedkeurt (stand &quot;Enabled&quot;), verkoopt hij.
          </li>
        </ol>
        <p className="mt-3 text-sm" style={{ color: "var(--a-dim)" }}>
          Een bestelling via een assistent komt hier en in Admin → Webshop binnen als gewone bestelling; de klant krijgt dezelfde bevestigingsmail en de voorraad gaat omlaag. Terugbetalen gaat zoals altijd in Stripe.
        </p>
      </Panel>

      <Panel flush title="Bestellingen via AI-assistenten" subtitle="Nieuwste eerst.">
        <DataTable
          columns={[
            { key: "klant", label: "Klant" },
            { key: "bedrag", label: "Bedrag", align: "right" },
            { key: "stand", label: "Stand" },
            { key: "op", label: "Binnen", hideOnMobile: true },
          ]}
          rows={bestelRijen}
          searchPlaceholder="Zoek op naam of plaats"
          csvName="bestellingen-via-ai"
          defaultSort={{ key: "op", dir: "desc" }}
          emptyText="Nog geen bestellingen via een AI-assistent."
        />
      </Panel>

      <Panel
        flush
        title="Horeca: tafels via AI-assistenten"
        subtitle={horecaAan ? `Open voor elke zaak die online staat met reserveren aan. Beschrijving voor assistenten: ${SITE.url}/api/agent/horeca/openapi.json` : "Staat uit (Systeem → Vlaggen: \"Reserveren via AI-assistenten\")."}
      >
        <DataTable
          columns={[
            { key: "zaak", label: "Zaak" },
            { key: "wanneer", label: "Voor" },
            { key: "stand", label: "Stand" },
            { key: "geboekt", label: "Geboekt", hideOnMobile: true },
          ]}
          rows={boekRijen}
          searchPlaceholder="Zoek een zaak"
          csvName="tafels-via-ai"
          defaultSort={{ key: "geboekt", dir: "desc" }}
          emptyText="Nog geen tafels gereserveerd via een AI-assistent."
        />
      </Panel>
    </div>
  );
}
