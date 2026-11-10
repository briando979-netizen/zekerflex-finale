import { getPrincipal, hasRole } from "@/lib/auth";
import { BASIS } from "@/lib/horeca/modules";
import {
  BTW,
  HARDWARE,
  OEM_FEITEN,
  PAKKETTEN,
  PEILDATUM,
  SOORT_NAAM,
  STANDAARD_ERBIJ,
  inkoopBereik,
  inkoopVoorRekenen,
  margeVanVerkoop,
  pakketTotaal,
  verkoopCentVan,
  voorstelCent,
} from "@/lib/hardware/catalogus";
import { getInstellingen } from "@/lib/hardware/store";
import { euroExact } from "@/lib/admin/format";
import { Notice, KpiStrip, PageHead, Panel, Pill } from "@/components/admin/kit";
import { DataTable, type TableRow } from "@/components/admin/kit-client";
import { HardwarePrijzen, type PrijsRegel } from "@/components/admin/HardwarePrijzen";

export const dynamic = "force-dynamic";

// Admin → Sales & groei → Hardware: de apparatuur bij het ZekerFlex horeca-systeem. Wat er te koop is,
// wat het ongeveer kost, welke apparaten ons merk kunnen dragen en wat een klant krijgt bij een pakket.
export default async function HardwarePagina() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="De hardwarelijst is alleen voor platformbeheerders." />;
  }
  const inst = await getInstellingen();
  const uit = new Set(inst.uit);

  const rijen: TableRow[] = HARDWARE.map((item) => {
    const bereik = inkoopBereik(item);
    const verkoop = verkoopCentVan(item, inst);
    const eigen = typeof inst.verkoopCent[item.id] === "number";
    const marge = verkoop !== null && bereik ? margeVanVerkoop(verkoop, bereik.totCent) : null;
    const onzeker = item.waarnemingen.some((x) => x.btw === "onbekend");
    return {
      id: item.id,
      search: `${item.naam} ${item.model} ${SOORT_NAAM[item.soort]}`,
      filters: { soort: item.soort, merk: item.eigenMerk },
      cells: {
        naam: (
          <span className="block max-w-[22rem]">
            <span className="block font-medium" style={{ color: "var(--a-text)" }}>{item.naam}</span>
            <span className="block text-xs" style={{ color: "var(--a-mute)" }}>{item.model}</span>
          </span>
        ),
        soort: SOORT_NAAM[item.soort],
        inkoop: bereik ? (
          <span className="num whitespace-nowrap">
            {bereik.vanCent === bereik.totCent ? euroExact(bereik.vanCent) : `${euroExact(bereik.vanCent)} tot ${euroExact(bereik.totCent)}`}
            {onzeker && <span className="block text-xs" style={{ color: "var(--a-warn-ink)" }}>btw onzeker</span>}
          </span>
        ) : (
          <Pill tone="warn">Prijs opvragen</Pill>
        ),
        verkoop: verkoop !== null ? (
          <span className="num whitespace-nowrap font-medium" style={{ color: "var(--a-text)" }}>
            {euroExact(verkoop)}
            <span className="block text-xs font-normal" style={{ color: "var(--a-mute)" }}>{eigen ? "jouw prijs" : "voorstel"}{marge !== null ? `, marge ${marge}%` : ""}</span>
          </span>
        ) : (
          "—"
        ),
        merk: item.eigenMerk === "oem" ? <Pill tone="trust">Eigen merk mogelijk</Pill> : <Pill tone="neutral">Alleen sticker</Pill>,
        bronnen: (
          <span className="flex max-w-[14rem] flex-wrap gap-x-2 text-xs">
            {[...new Map(item.waarnemingen.map((x) => [x.bron.url, x.bron])).values()].map((b) => (
              <a key={b.url} href={b.url} target="_blank" rel="noopener noreferrer" className="hover:underline" style={{ color: "var(--a-accent-ink)" }}>{b.label} ↗</a>
            ))}
            {item.waarnemingen.length === 0 && <span style={{ color: "var(--a-mute)" }}>nog geen bron</span>}
          </span>
        ),
        status: uit.has(item.id) ? <Pill tone="neutral">Uit de verkoop</Pill> : <Pill tone="ok">In de verkoop</Pill>,
      },
      sort: { naam: item.naam, soort: SOORT_NAAM[item.soort], inkoop: bereik?.totCent ?? null, verkoop },
      csv: { apparaat: item.naam, model: item.model, soort: SOORT_NAAM[item.soort], inkoop_excl_van: bereik ? (bereik.vanCent / 100).toFixed(2) : "", inkoop_excl_tot: bereik ? (bereik.totCent / 100).toFixed(2) : "", verkoop_excl: verkoop !== null ? (verkoop / 100).toFixed(2) : "" },
    };
  });

  const prijsRegels: PrijsRegel[] = HARDWARE.map((item) => {
    const inkoop = inkoopVoorRekenen(item);
    return { id: item.id, naam: item.naam, voorstelCent: inkoop === null ? null : voorstelCent(inkoop, inst.margePct), eigenCent: typeof inst.verkoopCent[item.id] === "number" ? (inst.verkoopCent[item.id] ?? null) : null, uit: uit.has(item.id) };
  });

  const zonderPrijs = HARDWARE.filter((i) => verkoopCentVan(i, inst) === null).length;

  return (
    <div className="space-y-4">
      <PageHead
        title="Hardware"
        subtitle="Kassa, printers, schermen en netwerk bij het ZekerFlex horeca-systeem: wat je kunt inkopen, wat het kost en wat een klant krijgt."
      />
      <Notice tone="warn">
        De inkoopprijzen komen uit een marktonderzoek van {PEILDATUM} bij webwinkels en leveranciers (bron bij elke regel). Ze zijn indicatief: ze wisselen per dag en niet elke bron zegt of de btw erin zit. Wat onbekend is, telt als exclusief btw. Vraag voor je bestelt een zakelijke offerte met staffelkorting. De verkoopprijzen zijn een voorstel; jij stelt ze onderaan vast.
      </Notice>

      <KpiStrip
        items={[
          { label: "Apparaten", value: String(HARDWARE.length), hint: "in de lijst", tone: "plan" },
          { label: "Pakketten", value: String(PAKKETTEN.length), hint: "Start, Compleet en Groot" },
          { label: "Marge", value: `${inst.margePct}%`, hint: "op de inkoop", tone: "money" },
          { label: "Zonder prijs", value: String(zonderPrijs), hint: zonderPrijs > 0 ? "nog een offerte nodig" : "alles heeft een prijs", tone: zonderPrijs > 0 ? "warn" : "ok" },
        ]}
      />

      <Panel flush title="Kopen-lijst" subtitle="Alles wat er bij een horeca-systeem hoort, met een voorbeeldmodel, de inkoop (excl. btw), ons verkoopvoorstel en of ons merk erop kan.">
        <DataTable
          columns={[
            { key: "naam", label: "Apparaat" },
            { key: "soort", label: "Soort", hideOnMobile: true },
            { key: "inkoop", label: "Inkoop (excl. btw)", align: "right" },
            { key: "verkoop", label: "Verkoop (excl. btw)", align: "right" },
            { key: "merk", label: "Eigen merk", hideOnMobile: true, sortable: false },
            { key: "bronnen", label: "Bronnen", hideOnMobile: true, sortable: false },
            { key: "status", label: "Status", hideOnMobile: true, sortable: false },
          ]}
          rows={rijen}
          searchPlaceholder="Zoek een apparaat of model"
          csvName="hardware-kopenlijst"
          pageSize={30}
          filters={[
            { key: "soort", label: "Soort", options: Object.entries(SOORT_NAAM).map(([value, label]) => ({ value, label })) },
            { key: "merk", label: "Eigen merk", chips: true, options: [{ value: "oem", label: "Eigen merk mogelijk" }, { value: "sticker", label: "Alleen sticker" }] },
          ]}
        />
      </Panel>

      <Panel title="Ons eigen merk op de apparatuur" subtitle="Staat ZekerFlex erop, en wat moet je daarvoor doen?">
        <div className="space-y-3 text-sm" style={{ color: "var(--a-dim)" }}>
          <p>{OEM_FEITEN.tekst}</p>
          <ul className="space-y-2">
            {OEM_FEITEN.niveaus.map((n) => (
              <li key={n.naam}>
                <span className="font-medium" style={{ color: "var(--a-text)" }}>{n.naam}.</span> {n.wat}
              </li>
            ))}
          </ul>
          <p>{OEM_FEITEN.advies}</p>
          <p className="text-xs" style={{ color: "var(--a-mute)" }}>
            Bronnen (voorbeelden van fabrikanten, geen offerte):{" "}
            {OEM_FEITEN.bronnen.map((b, i) => (
              <span key={b.url}>
                {i > 0 && ", "}
                <a href={b.url} target="_blank" rel="noopener noreferrer" className="hover:underline" style={{ color: "var(--a-accent-ink)" }}>{b.label} ↗</a>
              </span>
            ))}
          </p>
        </div>
      </Panel>

      <Panel title="Pakketten bij afname van het horeca-systeem" subtitle={`Naast de hardware heeft elke klant het abonnement (de basis vanaf ${euroExact(BASIS.prijsCentPerMaand)} per maand, modules erbij). De installatie zit in het pakket.`}>
        <div className="grid gap-4 lg:grid-cols-3">
          {PAKKETTEN.map((p) => {
            const t = pakketTotaal(p, inst);
            const inclusief = Math.round(t.verkoopCent * BTW);
            const marge = margeVanVerkoop(t.verkoopCent, t.inkoopCent);
            return (
              <section key={p.id} className="rounded-xl p-4" style={{ border: "1px solid var(--a-border)" }}>
                <h3 className="text-sm font-semibold" style={{ color: "var(--a-text)" }}>{p.naam}</h3>
                <p className="mt-0.5 text-xs" style={{ color: "var(--a-mute)" }}>{p.voorWie}</p>
                <ul className="mt-3 space-y-1 text-[0.8125rem]" style={{ color: "var(--a-dim)" }}>
                  {p.regels.map((r) => {
                    const item = HARDWARE.find((i) => i.id === r.item);
                    return <li key={r.item}>{r.aantal} × {item?.naam ?? r.item}</li>;
                  })}
                </ul>
                <dl className="mt-3 space-y-1 border-t pt-3 text-[0.8125rem]" style={{ borderColor: "var(--a-border)" }}>
                  <div className="flex justify-between"><dt style={{ color: "var(--a-mute)" }}>Hardware (excl. btw)</dt><dd className="num font-medium" style={{ color: "var(--a-text)" }}>{euroExact(t.verkoopCent)}</dd></div>
                  <div className="flex justify-between"><dt style={{ color: "var(--a-mute)" }}>Hardware (incl. btw)</dt><dd className="num">{euroExact(inclusief)}</dd></div>
                  <div className="flex justify-between"><dt style={{ color: "var(--a-mute)" }}>Installatie (excl. btw)</dt><dd className="num">{inst.installatieCent === null ? "nog vast te stellen" : euroExact(inst.installatieCent)}</dd></div>
                  <div className="flex justify-between"><dt style={{ color: "var(--a-mute)" }}>Inkoop</dt><dd className="num">{euroExact(t.inkoopCent)}{marge !== null ? `, marge ${marge}%` : ""}</dd></div>
                </dl>
                {t.zonderPrijs.length > 0 && (
                  <p className="mt-2 text-xs" style={{ color: "var(--a-warn-ink)" }}>Nog niet meegeteld (geen prijs): {[...new Set(t.zonderPrijs)].join(", ")}.</p>
                )}
              </section>
            );
          })}
        </div>
        <div className="mt-4">
          <h3 className="text-sm font-semibold" style={{ color: "var(--a-text)" }}>Dit krijgt elke klant erbij</h3>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[0.8125rem]" style={{ color: "var(--a-dim)" }}>
            {STANDAARD_ERBIJ.map((x) => <li key={x}>{x}</li>)}
          </ul>
          <p className="mt-2 text-xs" style={{ color: "var(--a-mute)" }}>Garantie volgt de leverancier van elk apparaat (de voorwaarden verschillen per merk). Een installatieafspraak met live volgen maak je onder Admin → Installaties.</p>
        </div>
      </Panel>

      <Panel title="Prijzen vaststellen" subtitle="Hier stel jij de echte prijzen vast. Je wijzigingen gelden meteen voor de lijst en de pakketten.">
        <HardwarePrijzen regels={prijsRegels} margePct={inst.margePct} installatieCent={inst.installatieCent} />
      </Panel>
    </div>
  );
}
