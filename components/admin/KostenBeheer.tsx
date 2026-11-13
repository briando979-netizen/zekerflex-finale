"use client";

import { useState } from "react";
import { KpiStrip, Notice, PageHead, Panel, Pill } from "@/components/admin/kit";
import { DataTable, type TableColumn, type TableRow } from "@/components/admin/kit-client";
import type { GeminiStand } from "@/lib/admin/gemini-verbruik";
import {
  PER_LABEL,
  SCHATTING_LABEL,
  USD_NAAR_EUR,
  bedragTekst,
  bronRegel,
  datumKort,
  financienBronTekst,
  formatEuro,
  postId,
  splits,
  totalen,
  type KostenPost,
  type KostenStand,
  type OperationeleKosten,
  type Munt,
  type Per,
  type TransipFacturen,
} from "@/lib/admin/kosten";

// Beheer -> Kosten. Gemeten (TransIP-facturen), opgegeven (handmatig, altijd met bron en datum) en geschat staan in
// aparte panelen en worden nooit bij elkaar opgeteld. Na een wijziging nemen we de teruggegeven serverversie over.

type Fout = string | null;

const VELD = "mt-1 block w-full rounded-lg border px-3 py-2 text-sm";
const VELD_STIJL = { background: "var(--a-panel, transparent)", color: "var(--a-text)", borderColor: "var(--a-line, #cbd5d1)" } as const;

function vandaag(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });
}

/** "200", "200,50" of "1.200,50" -> centen; leeg of onleesbaar -> null. */
function naarCent(tekst: string): number | null {
  const schoon = tekst.trim().replace(/\./g, "").replace(",", ".");
  if (!schoon) return null;
  const n = Number(schoon);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

function leegPost(soort: "handmatig" | "schatting", bestaand: string[]): KostenPost {
  return { id: postId("nieuwe post", bestaand), naam: "", soort, bedragCent: null, munt: "EUR", per: "maand", btwPct: null, bron: soort === "schatting" ? SCHATTING_LABEL : "", datum: vandaag() };
}

function PostFormulier({
  start,
  nieuw,
  bezig,
  fout,
  onOpslaan,
  onAnnuleren,
}: {
  start: KostenPost;
  nieuw: boolean;
  bezig: boolean;
  fout: Fout;
  onOpslaan: (post: KostenPost, bestaandId: string | null) => void;
  onAnnuleren: () => void;
}) {
  const [naam, setNaam] = useState(start.naam);
  const [soort, setSoort] = useState(start.soort);
  const [onbekend, setOnbekend] = useState(start.bedragCent === null);
  const [bedrag, setBedrag] = useState(start.bedragCent === null ? "" : String(start.bedragCent / 100).replace(".", ","));
  const [munt, setMunt] = useState<Munt>(start.munt);
  const [per, setPer] = useState<Per>(start.per);
  const [btw, setBtw] = useState(start.btwPct === null ? "" : String(start.btwPct));
  const [bron, setBron] = useState(start.bron);
  const [datum, setDatum] = useState(start.datum ?? "");
  const [opmerking, setOpmerking] = useState(start.opmerking ?? "");
  const [lokaal, setLokaal] = useState<Fout>(null);
  const pre = `kosten-${start.id}`;

  function bewaar() {
    const cent = onbekend ? null : naarCent(bedrag);
    if (!onbekend && cent === null) return setLokaal("Vul een bedrag in (bijvoorbeeld 200 of 7,70), of vink 'bedrag onbekend' aan.");
    if (!naam.trim()) return setLokaal("Geef de post een naam.");
    if (!bron.trim()) return setLokaal("Vul in waar het bedrag vandaan komt (bron).");
    setLokaal(null);
    const post: KostenPost = {
      id: start.id,
      naam: naam.trim(),
      soort,
      bedragCent: cent,
      munt,
      per,
      btwPct: btw === "" ? null : Number(btw),
      bron: bron.trim(),
      datum: datum || null,
      ...(opmerking.trim() ? { opmerking: opmerking.trim() } : {}),
    };
    onOpslaan(post, nieuw ? null : start.id);
  }

  return (
    <Panel title={nieuw ? "Nieuwe kostenpost" : `Bewerken: ${start.naam}`} subtitle="Bedragen zonder btw. Een onbekend bedrag blijft 'bedrag onbekend'; er wordt niets verzonnen.">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${pre}-naam`} className="text-xs font-medium">Naam</label>
          <input id={`${pre}-naam`} className={VELD} style={VELD_STIJL} value={naam} onChange={(e) => setNaam(e.target.value)} maxLength={80} />
        </div>
        <div>
          <label htmlFor={`${pre}-soort`} className="text-xs font-medium">Soort</label>
          <select id={`${pre}-soort`} className={VELD} style={VELD_STIJL} value={soort} onChange={(e) => setSoort(e.target.value === "schatting" ? "schatting" : "handmatig")}>
            <option value="handmatig">Opgave (handmatig, met bron)</option>
            <option value="schatting">Schatting (accountant moet bevestigen)</option>
          </select>
        </div>
        <div>
          <label htmlFor={`${pre}-bedrag`} className="text-xs font-medium">Bedrag (zonder btw)</label>
          <input id={`${pre}-bedrag`} inputMode="decimal" className={VELD} style={VELD_STIJL} value={bedrag} disabled={onbekend} onChange={(e) => setBedrag(e.target.value)} placeholder="bijv. 200 of 7,70" />
          <label className="mt-1 flex items-center gap-2 text-xs">
            <input type="checkbox" checked={onbekend} onChange={(e) => setOnbekend(e.target.checked)} /> Bedrag onbekend
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor={`${pre}-munt`} className="text-xs font-medium">Munt</label>
            <select id={`${pre}-munt`} className={VELD} style={VELD_STIJL} value={munt} onChange={(e) => setMunt(e.target.value === "USD" ? "USD" : "EUR")}>
              <option value="EUR">Euro</option>
              <option value="USD">Dollar</option>
            </select>
          </div>
          <div>
            <label htmlFor={`${pre}-per`} className="text-xs font-medium">Per</label>
            <select id={`${pre}-per`} className={VELD} style={VELD_STIJL} value={per} onChange={(e) => setPer(e.target.value === "jaar" ? "jaar" : e.target.value === "eenmalig" ? "eenmalig" : "maand")}>
              <option value="maand">Maand</option>
              <option value="jaar">Jaar</option>
              <option value="eenmalig">Eenmalig</option>
            </select>
          </div>
        </div>
        <div>
          <label htmlFor={`${pre}-btw`} className="text-xs font-medium">Btw op dit bedrag</label>
          <select id={`${pre}-btw`} className={VELD} style={VELD_STIJL} value={btw} onChange={(e) => setBtw(e.target.value)}>
            <option value="">Onbekend (er komt niets bij)</option>
            <option value="21">21%</option>
            <option value="9">9%</option>
            <option value="0">0% (geen btw)</option>
          </select>
        </div>
        <div>
          <label htmlFor={`${pre}-datum`} className="text-xs font-medium">Datum van de bron</label>
          <input id={`${pre}-datum`} type="date" className={VELD} style={VELD_STIJL} value={datum} onChange={(e) => setDatum(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={`${pre}-bron`} className="text-xs font-medium">Bron</label>
          <input id={`${pre}-bron`} className={VELD} style={VELD_STIJL} value={bron} onChange={(e) => setBron(e.target.value)} maxLength={120} placeholder="bijv. opgave eigenaar, factuur, API" />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={`${pre}-opm`} className="text-xs font-medium">Opmerking (niet verplicht)</label>
          <input id={`${pre}-opm`} className={VELD} style={VELD_STIJL} value={opmerking} onChange={(e) => setOpmerking(e.target.value)} maxLength={200} />
        </div>
      </div>
      {(lokaal ?? fout) && (
        <p role="alert" className="mt-3 text-sm font-semibold text-crit">
          {lokaal ?? fout}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={bewaar} disabled={bezig} className="btn-primary text-sm">
          {bezig ? "Bezig met opslaan..." : "Opslaan"}
        </button>
        <button type="button" onClick={onAnnuleren} disabled={bezig} className="btn-ghost text-sm">
          Annuleren
        </button>
      </div>
    </Panel>
  );
}

function postRijen(posten: KostenPost[], bezig: boolean, onBewerk: (p: KostenPost) => void, onVerwijder: (p: KostenPost) => void): TableRow[] {
  return posten.map((p) => ({
    id: p.id,
    search: `${p.naam} ${p.bron}`,
    sort: { naam: p.naam, bedrag: p.bedragCent },
    cells: {
      naam: (
        <span>
          <span className="font-medium">{p.naam}</span>
          {p.opmerking ? <span className="block text-xs" style={{ color: "var(--a-mute)" }}>{p.opmerking}</span> : null}
        </span>
      ),
      bedrag: p.bedragCent === null ? <Pill tone="neutral">bedrag onbekend</Pill> : <span>{bedragTekst(p)}</span>,
      per: PER_LABEL[p.per],
      bron: <span className="text-xs">{p.soort === "schatting" ? `${p.bron}` : `handmatig: ${bronRegel(p)}`}</span>,
      actie: (
        <span className="flex justify-end gap-2">
          <button type="button" disabled={bezig} onClick={() => onBewerk(p)} className="btn-ghost text-xs">Bewerken</button>
          <button type="button" disabled={bezig} onClick={() => onVerwijder(p)} className="btn-ghost text-xs">Verwijderen</button>
        </span>
      ),
    },
  }));
}

const KOLOMMEN: TableColumn[] = [
  { key: "naam", label: "Post", sortable: true },
  { key: "bedrag", label: "Bedrag (excl. btw)", sortable: true },
  { key: "per", label: "Per" },
  { key: "bron", label: "Bron en datum", hideOnMobile: true },
  { key: "actie", label: "", align: "right" },
];

export function KostenBeheer({ initieel, transip, financien, gemini }: { initieel: KostenStand; transip: TransipFacturen; financien: OperationeleKosten; gemini?: GeminiStand }) {
  const [stand, setStand] = useState<KostenStand>(initieel);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<Fout>(null);
  const [formulier, setFormulier] = useState<{ post: KostenPost; nieuw: boolean } | null>(null);

  const { vaststaand, geschat } = splits(stand.posten);
  const t = totalen(vaststaand);
  const tg = totalen(geschat);

  async function stuur(wijziging: { upsert: KostenPost } | { verwijder: string }): Promise<boolean> {
    setBezig(true);
    setFout(null);
    try {
      const res = await fetch("/api/admin/kosten", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(wijziging) });
      const d = (await res.json().catch(() => ({}))) as { stand?: KostenStand; error?: { message?: string } };
      if (!res.ok || !d.stand) {
        setFout(d.error?.message ?? "Opslaan lukte niet. Probeer het opnieuw.");
        return false;
      }
      // de teruggegeven serverversie vervangt de lijst, we passen niet zelf een veld aan
      setStand(d.stand);
      return true;
    } catch {
      setFout("Geen verbinding met ZekerFlex. Probeer het opnieuw.");
      return false;
    } finally {
      setBezig(false);
    }
  }

  async function opslaan(post: KostenPost) {
    if (await stuur({ upsert: post })) setFormulier(null);
  }

  async function verwijder(p: KostenPost) {
    if (!window.confirm(`"${p.naam}" uit de kostenlijst halen?`)) return;
    await stuur({ verwijder: p.id });
  }

  // de lijst voor het eerst bewaren: een ongewijzigde post opnieuw opslaan bewaart de hele lijst
  async function bevestigLijst() {
    const eerste = stand.posten[0];
    if (eerste) await stuur({ upsert: eerste });
  }

  const bestaandeIds = stand.posten.map((p) => p.id);
  const nieuwePost = (soort: "handmatig" | "schatting") => setFormulier({ post: leegPost(soort, bestaandeIds), nieuw: true });

  return (
    <div className="space-y-5">
      <PageHead
        title="Kosten"
        subtitle="Wat het platform kost: gemeten, opgegeven en geschat, strikt gescheiden. Bedragen zonder btw tenzij anders vermeld."
        actions={
          <button type="button" onClick={() => nieuwePost("handmatig")} disabled={bezig || formulier !== null} className="btn-primary text-sm">
            Post toevoegen
          </button>
        }
      />

      {fout && formulier === null && <Notice tone="crit" role="alert">{fout}</Notice>}

      <Panel title="Vaststaand: opgegeven kosten" subtitle="Alleen posten met een bron en datum die iemand heeft opgegeven of gemeten. Geen schattingen.">
        <KpiStrip
          items={[
            { label: "Per maand, excl. btw", value: formatEuro(t.maandExclCent), hint: `${t.geteld} posten geteld` },
            { label: "Per maand, incl. btw", value: formatEuro(t.maandInclCent), hint: t.zonderBtw > 0 ? `${t.zonderBtw} posten zonder bekende btw: daar komt niets bij` : "met het btw-percentage per post" },
            { label: "Per jaar, excl. btw", value: formatEuro(t.jaarExclCent) },
            { label: "Per jaar, incl. btw", value: formatEuro(t.jaarInclCent) },
          ]}
        />
        <ul className="mt-3 space-y-1 text-xs" style={{ color: "var(--a-mute)" }}>
          {t.onbekend > 0 && <li>{t.onbekend} posten met “bedrag onbekend” staan in de lijst maar tellen niet mee: het totaal is dus minimaal.</li>}
          {t.eenmalig > 0 && <li>{t.eenmalig} eenmalige post(en) tellen niet mee in de maand- en jaartotalen.</li>}
          {t.omgerekend > 0 && <li>{t.omgerekend} post(en) in dollars zijn omgerekend met de aanname 1 USD = {String(USD_NAAR_EUR).replace(".", ",")} EUR (geen bankkoers).</li>}
          <li>Jaarbedragen staan per maand als een twaalfde, maandbedragen per jaar als twaalf keer.</li>
        </ul>
      </Panel>

      {formulier && (
        <PostFormulier
          key={formulier.post.id + String(formulier.nieuw)}
          start={formulier.post}
          nieuw={formulier.nieuw}
          bezig={bezig}
          fout={fout}
          onOpslaan={(post) => void opslaan(post)}
          onAnnuleren={() => {
            setFormulier(null);
            setFout(null);
          }}
        />
      )}

      <Panel flush title="Opgegeven posten" subtitle="Handmatig, altijd met bron en datum" actions={<span className="text-xs" style={{ color: "var(--a-mute)" }}>{vaststaand.length} posten</span>}>
        <DataTable
          columns={KOLOMMEN}
          rows={postRijen(vaststaand, bezig, (p) => setFormulier({ post: p, nieuw: false }), (p) => void verwijder(p))}
          searchPlaceholder="Zoek een post"
          pageSize={50}
          emptyText="Nog geen opgegeven kosten."
        />
      </Panel>

      <Panel
        flush
        title="Geschat: nog te bevestigen"
        subtitle="Schattingen tellen niet mee in het vaststaande totaal hierboven"
        actions={
          <button type="button" onClick={() => nieuwePost("schatting")} disabled={bezig || formulier !== null} className="btn-ghost text-xs">
            Schatting toevoegen
          </button>
        }
      >
        <div className="px-4 pb-3 sm:px-5">
          <p className="text-sm">
            Geschat per jaar: <strong>{formatEuro(tg.jaarExclCent)}</strong> excl. btw <span className="text-xs" style={{ color: "var(--a-mute)" }}>({SCHATTING_LABEL})</span>
          </p>
        </div>
        <DataTable columns={KOLOMMEN} rows={postRijen(geschat, bezig, (p) => setFormulier({ post: p, nieuw: false }), (p) => void verwijder(p))} pageSize={50} emptyText="Geen schattingen." />
      </Panel>

      <Panel title="Gemeten: TransIP-facturen" subtitle="Rechtstreeks uit de TransIP-API, de laatste 12 maanden, hooguit een keer per uur gelezen. Niet opgeteld bij de posten hierboven.">
        {transip.ok ? (
          transip.perMaand.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--a-mute)" }}>Geen facturen in de laatste 12 maanden.</p>
          ) : (
            <table className="w-full text-sm">
              <caption className="sr-only">TransIP-facturen per maand</caption>
              <thead>
                <tr className="text-left text-xs" style={{ color: "var(--a-mute)" }}>
                  <th scope="col" className="py-1 pr-3 font-medium">Maand</th>
                  <th scope="col" className="py-1 pr-3 text-right font-medium">Facturen</th>
                  <th scope="col" className="py-1 pr-3 text-right font-medium">Excl. btw</th>
                  <th scope="col" className="py-1 text-right font-medium">Incl. btw</th>
                </tr>
              </thead>
              <tbody>
                {transip.perMaand.map((m) => (
                  <tr key={m.maand}>
                    <td className="py-1 pr-3">{datumKort(`${m.maand}-01`).replace(/^1 /, "")} {m.maand.slice(0, 4)}</td>
                    <td className="py-1 pr-3 text-right">{m.aantal}</td>
                    <td className="py-1 pr-3 text-right">{formatEuro(m.exclCent)}</td>
                    <td className="py-1 text-right">{formatEuro(m.inclCent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : (
          <Notice tone="warn" role="alert">{transip.melding} De opgegeven posten hierboven blijven staan.</Notice>
        )}
      </Panel>

      {stand.versie === 0 && (
        <Notice tone="warn" role="status">
          Deze lijst is nog niet opgeslagen, dus Financiën gebruikt hem nog niet. Klopt de lijst? Bevestig hem dan hieronder; of pas eerst een post aan.
          <button type="button" disabled={bezig} onClick={() => void bevestigLijst()} className="btn-ghost ml-2 text-xs">Lijst bevestigen</button>
        </Notice>
      )}

      {gemini && (
        <Panel title="Gemeten: Gemini-verbruik" subtitle="Uit het AI-gebruikslogboek van ZekerFlex (aanroepen en tokens, nooit inhoud), hooguit een keer per uur gelezen. Een prijs staat hier niet: die zie je in Google Cloud.">
          {gemini.ok ? (
            <div className="space-y-2 text-sm">
              <p role="status">{gemini.regel}</p>
              {gemini.verbruik.perModel.length > 0 && (
                <ul className="space-y-1 text-xs" style={{ color: "var(--a-mute)" }}>
                  {gemini.verbruik.perModel.map((m) => (
                    <li key={m.model}>
                      {m.model}: {m.aanroepen.toLocaleString("nl-NL")} aanroepen, {m.tokens.toLocaleString("nl-NL")} tokens
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs" style={{ color: "var(--a-mute)" }}>Tokens zoals de aanbieder ze meldt; een aanroep zonder opgave telt als nul tokens. Alleen Gemini; andere aanbieders staan hier niet.</p>
            </div>
          ) : (
            <Notice tone="warn" role="alert">{gemini.melding}</Notice>
          )}
        </Panel>
      )}

      {financien.bron === "kosten" ? (
        <Notice tone="neutral">
          Financiën &amp; winst rekent met het maandtotaal van de opgegeven posten: {formatEuro(financien.maandCent)} per maand, excl. btw, zonder schattingen en zonder posten met een onbekend bedrag ({financienBronTekst(financien.bijgewerktOp)}).
        </Notice>
      ) : (
        <Notice tone="warn" role="alert">{financien.melding}</Notice>
      )}
    </div>
  );
}
