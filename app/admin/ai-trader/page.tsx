import { getPrincipal, hasRole } from "@/lib/auth";
import { Empty, KpiStrip, Notice, PageHead, Panel, Pill } from "@/components/admin/kit";
import { Chart, DataTable, type TableRow } from "@/components/admin/kit-client";
import { AiTraderSleutel } from "@/components/admin/AiTraderSleutel";
import { alpacaSleutelInfo, leesTraderStand } from "@/lib/trader/alpaca";
import { STARTBEDRAG, dollars, isOpen, orderStatus, procent, rendement } from "@/lib/trader/alpaca-core";
import { amsterdamClock, amsterdamDayKey } from "@/lib/time/amsterdam";

export const dynamic = "force-dynamic";

const tijd = (iso: string | null) => (iso ? `${amsterdamDayKey(iso)} ${amsterdamClock(iso)}` : "onbekend");

export default async function AdminAiTraderPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="De AI-trader is alleen beschikbaar voor platformbeheerders." />;
  }
  const [info, stand] = await Promise.all([alpacaSleutelInfo().catch(() => ({ aanwezig: false, ingesteldOp: null })), leesTraderStand()]);

  const kop = (
    <PageHead
      title="AI-trader"
      subtitle="Alleen kijken: de stand van de demo-rekening bij Alpaca. Dit is papier, met nep-geld, en geen echte rekening. Er zijn hier geen knoppen om te kopen of verkopen."
      meta={<Pill tone="plan">Papier, geen echt geld</Pill>}
    />
  );
  const sleutel = (
    <Panel title="Alpaca-papiersleutel" subtitle="Alleen lezen. De sleutel wordt verzegeld bewaard en komt nooit terug in beeld.">
      <AiTraderSleutel aanwezig={info.aanwezig} ingesteldOp={info.ingesteldOp ? tijd(info.ingesteldOp) : null} />
    </Panel>
  );

  if (stand.soort === "geen-sleutel") {
    return (
      <div className="space-y-4">
        {kop}
        <Empty title="Nog geen sleutel ingevuld" body="Vul hieronder de papier-sleutel van Alpaca in. Daarna staan hier het vermogen, de posities en de orders van de AI-trader." />
        {sleutel}
      </div>
    );
  }
  if (stand.soort === "fout") {
    return (
      <div className="space-y-4">
        {kop}
        <Notice tone="crit" role="alert">{stand.tekst}</Notice>
        {sleutel}
      </div>
    );
  }

  const { rekening, posities, orders, verloop } = stand;
  const winst = rendement(rekening.vermogen);
  const open = orders.filter((o) => isOpen(o.status));
  const uitgevoerd = orders.filter((o) => o.status === "filled" || o.status === "partially_filled");
  const belegd = posities.reduce((s, p) => s + p.waarde, 0);
  const geenHandel = uitgevoerd.length === 0 && posities.length === 0;

  const orderRijen: TableRow[] = orders.map((o) => {
    const s = orderStatus(o.status);
    return {
      id: o.id,
      cells: {
        tijd: tijd(o.ingediend),
        wat: `${o.kant === "kopen" ? "Kopen" : "Verkopen"} ${o.symbool}`,
        aantal: String(o.aantal),
        prijs: o.prijs === null ? "nog niet" : dollars(o.prijs),
        status: <Pill tone={s.toon}>{s.tekst}</Pill>,
      },
      sort: { tijd: o.ingediend ?? "" },
    };
  });
  const positieRijen: TableRow[] = posities.map((p) => ({
    id: p.symbool,
    cells: { fonds: p.symbool, aantal: String(p.aantal), koers: dollars(p.koers), waarde: dollars(p.waarde), resultaat: dollars(p.resultaat) },
    sort: { waarde: p.waarde },
  }));

  return (
    <div className="space-y-4">
      {kop}
      {geenHandel ? (
        <Notice tone="plan">
          Nog geen handelsdag: er is nog niets gekocht. {open.length > 0 ? `${open.length} order(s) wachten op de opening van de beurs (meestal 15:30 Nederlandse tijd).` : "Er staan geen orders klaar."} Het vermogen is nu nog het startbedrag; dat zegt niets over de aanpak.
        </Notice>
      ) : null}
      <KpiStrip
        items={[
          { label: "Vermogen", value: dollars(rekening.vermogen), hint: `waarvan kas ${dollars(rekening.cash)}` },
          { label: `Rendement sinds de start (${dollars(STARTBEDRAG)})`, value: procent(winst), tone: winst > 0 ? "ok" : winst < 0 ? "crit" : "neutral" },
          { label: "Belegd", value: dollars(belegd), hint: `${posities.length} positie(s)` },
          { label: "Open orders", value: String(open.length), hint: open.length > 0 ? "wachten op de beurs" : undefined },
        ]}
      />
      <Panel title="Vermogen in de tijd" subtitle="Rendement per dag ten opzichte van het startbedrag, uit het portefeuilleverloop van Alpaca.">
        {verloop.vermogen.length >= 2 ? (
          <Chart
            title="Rendement per dag ten opzichte van het startbedrag"
            labels={verloop.tijden.map((t) => amsterdamDayKey(t))}
            series={[{ label: "Rendement", values: verloop.vermogen.map((v) => Math.round(rendement(v) * 10000) / 100) }]}
            unit="percent"
          />
        ) : (
          <p className="text-sm" style={{ color: "var(--a-dim)" }}>De grafiek verschijnt zodra er minstens twee dagen zijn gemeten.</p>
        )}
      </Panel>
      <Panel title="Posities" flush>
        {posities.length === 0 ? (
          <p className="px-4 pb-4 text-sm" style={{ color: "var(--a-dim)" }}>Geen posities: alles staat in kas.</p>
        ) : (
          <DataTable
            columns={[
              { key: "fonds", label: "Fonds" },
              { key: "aantal", label: "Aantal", align: "right" },
              { key: "koers", label: "Koers", align: "right" },
              { key: "waarde", label: "Waarde", align: "right", sortable: true },
              { key: "resultaat", label: "Resultaat", align: "right" },
            ]}
            rows={positieRijen}
            pageSize={20}
          />
        )}
      </Panel>
      <Panel title="Orders" subtitle="De laatste 50, nieuwste bovenaan. Tijden in Nederlandse tijd." flush>
        <DataTable
          columns={[
            { key: "tijd", label: "Ingediend", sortable: true },
            { key: "wat", label: "Order" },
            { key: "aantal", label: "Aantal", align: "right" },
            { key: "prijs", label: "Prijs", align: "right", hideOnMobile: true },
            { key: "status", label: "Stand" },
          ]}
          rows={orderRijen}
          pageSize={20}
          emptyText="Nog geen orders."
          defaultSort={{ key: "tijd", dir: "desc" }}
        />
      </Panel>
      {sleutel}
    </div>
  );
}