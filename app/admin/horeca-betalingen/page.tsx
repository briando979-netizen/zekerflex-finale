import { getPrincipal, hasRole } from "@/lib/auth";
import { afrekenOverzicht } from "@/lib/horeca/betalen";
import { count, dateTimeNl, euro } from "@/lib/admin/format";
import { KpiStrip, NameCell, Notice, PageHead, Panel, Pill } from "@/components/admin/kit";
import { DataTable, type TableRow } from "@/components/admin/kit-client";

export const dynamic = "force-dynamic";

// Afrekenen aan tafel met iDEAL, voor de platformbeheerder: alleen inzien.
// Het geld gaat bij elke betaling meteen door naar het eigen Stripe-account van
// de zaak (lib/horeca/betalen.ts); hier staat geen enkele knop die iets wijzigt.

const STATUS: Record<string, { label: string; tone: "ok" | "warn" | "crit" }> = {
  BETAALD: { label: "Betaald", tone: "ok" },
  OPEN: { label: "Gestart", tone: "warn" },
  MISLUKT: { label: "Niet betaald", tone: "crit" },
};

export default async function HorecaBetalingenPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="Dit overzicht is alleen voor platformbeheerders." />;
  }
  const d = await afrekenOverzicht(90);
  const naamVan = new Map(d.zaken.map((z) => [z.id, z.naam]));
  const betaald = d.betalingen.filter((b) => b.status === "BETAALD");
  const dertig = Date.now() - 30 * 86_400_000;
  const recent = betaald.filter((b) => (b.betaaldOp ?? b.createdAt).getTime() >= dertig);
  const dubbel = betaald.filter((b) => b.door.includes("LET OP"));

  const rows: TableRow[] = d.betalingen.map((b) => {
    const s = STATUS[b.status] ?? { label: b.status, tone: "warn" as const };
    const zaak = naamVan.get(b.zaakId) ?? "Onbekende zaak";
    return {
      id: b.id,
      search: `${zaak} ${b.tafel?.naam ?? ""} ${b.bonNummer ?? ""}`,
      filters: { status: b.status },
      cells: {
        zaak: <NameCell name={zaak} sub={b.tafel?.naam ?? "Zonder tafel"} />,
        status: <Pill tone={s.tone}>{s.label}</Pill>,
        bedrag: euro(b.bedragCent),
        fooi: b.fooiCent ? euro(b.fooiCent) : "—",
        bon: b.bonNummer ? String(b.bonNummer) : "—",
        op: dateTimeNl(b.betaaldOp ?? b.createdAt),
        let: b.door.includes("LET OP") ? <Pill tone="crit">Al afgerekend: terugbetalen</Pill> : "",
      },
      sort: { zaak, status: b.status, bedrag: b.bedragCent, fooi: b.fooiCent, bon: b.bonNummer ?? 0, op: (b.betaaldOp ?? b.createdAt).getTime() },
      csv: { zaak, tafel: b.tafel?.naam ?? "", status: s.label, bedrag: (b.bedragCent / 100).toFixed(2), fooi: (b.fooiCent / 100).toFixed(2), bon: b.bonNummer ?? "", op: (b.betaaldOp ?? b.createdAt).toISOString() },
    };
  });

  const zaakRows: TableRow[] = d.zaken.map((z) => {
    const stand = z.stripe.klaar ? { label: "Klaar", tone: "ok" as const } : z.stripe.gekoppeld ? { label: "Aanmelding loopt", tone: "warn" as const } : { label: "Niet gekoppeld", tone: "neutral" as const };
    return {
      id: z.id,
      search: `${z.naam} ${z.plaats}`,
      cells: {
        zaak: <NameCell name={z.naam} sub={z.plaats || "—"} />,
        module: z.betalenAan ? <Pill tone="ok">Aan</Pill> : <Pill tone="neutral">Uit</Pill>,
        stripe: <Pill tone={stand.tone}>{stand.label}</Pill>,
      },
      sort: { zaak: z.naam, module: z.betalenAan ? 1 : 0, stripe: z.stripe.klaar ? 2 : z.stripe.gekoppeld ? 1 : 0 },
      csv: { zaak: z.naam, plaats: z.plaats, module: z.betalenAan ? "aan" : "uit", stripe: stand.label },
    };
  });

  return (
    <div className="space-y-4">
      <PageHead title="Horeca-betalingen" subtitle="Gasten die aan tafel afrekenen met iDEAL. Alleen om in te zien: het geld gaat direct naar het eigen Stripe-account van de zaak." />

      <Notice>
        ZekerFlex houdt per betaling alleen de iDEAL-kosten in die Stripe rekent (€ 0,29). De rest staat op het Stripe-account van de zaak en Stripe betaalt het vanzelf uit op haar bankrekening. Terugbetalen doet de zaak zelf in haar Stripe-overzicht.
      </Notice>

      <KpiStrip
        items={[
          { label: "Zaken klaar voor iDEAL", value: count(d.zaken.filter((z) => z.stripe.klaar).length), hint: `van ${count(d.zaken.length)} horecazaken` },
          { label: "Betalingen", value: count(recent.length), hint: "laatste 30 dagen" },
          { label: "Ontvangen", value: euro(recent.reduce((s, b) => s + b.bedragCent, 0)), hint: "laatste 30 dagen, zonder fooi", tone: "money" },
          { label: "Fooi", value: euro(recent.reduce((s, b) => s + b.fooiCent, 0)), hint: "laatste 30 dagen" },
          { label: "Terug te betalen", value: count(dubbel.length), hint: "betaald voor een rekening die al was afgerekend", ...(dubbel.length ? { tone: "crit" as const } : {}) },
        ]}
      />

      <Panel flush title="Betalingen" subtitle={`Laatste 90 dagen, ${count(d.betalingen.length)} keer gestart.`}>
        <DataTable
          columns={[
            { key: "zaak", label: "Zaak en tafel" },
            { key: "status", label: "Stand" },
            { key: "bedrag", label: "Bedrag", align: "right" },
            { key: "fooi", label: "Fooi", align: "right", hideOnMobile: true },
            { key: "bon", label: "Bon", align: "right", hideOnMobile: true },
            { key: "op", label: "Wanneer", hideOnMobile: true },
            { key: "let", label: "Let op", hideOnMobile: true },
          ]}
          rows={rows}
          searchPlaceholder="Zoek op zaak, tafel of bonnummer"
          csvName="horeca-betalingen"
          defaultSort={{ key: "op", dir: "desc" }}
          filters={[{ key: "status", label: "Stand", chips: true, options: [{ value: "BETAALD", label: "Betaald" }, { value: "OPEN", label: "Gestart" }, { value: "MISLUKT", label: "Niet betaald" }] }]}
          emptyText="Nog geen betalingen aan tafel."
        />
      </Panel>

      <Panel flush title="Zaken" subtitle="Welke zaken online afrekenen en hoe ver hun Stripe-account is.">
        <DataTable
          columns={[
            { key: "zaak", label: "Zaak" },
            { key: "module", label: "Module afrekenen" },
            { key: "stripe", label: "Stripe-account" },
          ]}
          rows={zaakRows}
          searchPlaceholder="Zoek een zaak"
          csvName="horeca-zaken-stripe"
          defaultSort={{ key: "zaak", dir: "asc" }}
          emptyText="Er zijn nog geen horecazaken."
        />
      </Panel>
    </div>
  );
}
