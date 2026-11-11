"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MAX_REGELS, MAX_VOORWAARDEN, STATUS_NAAM, nlDag, nlMoment, totalenVan, type EffectieveStatus, type OfferteBeheer } from "@/lib/offertes/model";
import { BTW_TARIEVEN, aantalTekst, aantalUitTekst, berekenTotalen, centUitTekst, euro, procentTekst } from "@/lib/offertes/rekenen";

// Het offertebeheer van een bedrijf: de lijst (filter op status, zoeken), een offerte maken of bewerken met live totalen,
// de link voor de klant kopiëren en de reactie van de klant zien. Er wordt niets gemaild: het bedrijf stuurt de link zelf.

const kaart = "rounded-xl border border-hair bg-white p-4";
const knopKlein = "rounded-lg border border-hairstrong px-2.5 py-1 text-xs font-semibold text-ink hover:border-brand-500";
const KLEUR: Record<EffectieveStatus, string> = {
  concept: "bg-paper-soft text-neutralx-600",
  verstuurd: "bg-plan-soft text-plan",
  geaccepteerd: "bg-ok/10 text-ok",
  afgewezen: "bg-crit/10 text-crit",
  verlopen: "bg-paper-soft text-warn",
};
const FILTERS: ("alle" | EffectieveStatus)[] = ["alle", "concept", "verstuurd", "geaccepteerd", "afgewezen", "verlopen"];

interface Lading {
  offertes: OfferteBeheer[];
  vandaag: string;
  standaardGeldigTot: string;
}

interface RegelVeld {
  omschrijving: string;
  aantal: string;
  eenheid: string;
  prijs: string;
  btw: number;
}
interface Formulier {
  naam: string;
  email: string;
  telefoon: string;
  adres: string;
  titel: string;
  inleiding: string;
  regels: RegelVeld[];
  korting: string;
  geldigTot: string;
  voorwaarden: string;
}

const leegRegel = (): RegelVeld => ({ omschrijving: "", aantal: "1", eenheid: "stuk", prijs: "", btw: 21 });
const beginFormulier = (geldigTot: string): Formulier => ({ naam: "", email: "", telefoon: "", adres: "", titel: "", inleiding: "", regels: [leegRegel()], korting: "", geldigTot, voorwaarden: "" });
const formulierVan = (o: OfferteBeheer): Formulier => ({
  naam: o.klant.naam,
  email: o.klant.email,
  telefoon: o.klant.telefoon,
  adres: o.klant.adres,
  titel: o.titel,
  inleiding: o.inleiding,
  regels: o.regels.map((r) => ({ omschrijving: r.omschrijving, aantal: aantalTekst(r.aantal), eenheid: r.eenheid, prijs: (r.prijsCent / 100).toFixed(2).replace(".", ","), btw: r.btw })),
  korting: o.kortingBp ? procentTekst(o.kortingBp) : "",
  geldigTot: o.geldigTot,
  voorwaarden: o.voorwaarden,
});

/** Het formulier naar wat de server verwacht; een foutmelding als een veld niet te lezen is. */
function naarBody(f: Formulier): { body: Record<string, unknown> } | { fout: string } {
  const regels: Record<string, unknown>[] = [];
  for (let n = 0; n < f.regels.length; n++) {
    const r = f.regels[n] ?? leegRegel();
    if (!r.omschrijving.trim() && !r.prijs.trim()) continue;
    const aantal = aantalUitTekst(r.aantal);
    if (aantal === null) return { fout: `Regel ${n + 1}: vul een aantal in (hoogstens 3 decimalen, bijvoorbeeld 2,5).` };
    const prijsCent = r.prijs.trim() ? centUitTekst(r.prijs) : 0;
    if (prijsCent === null) return { fout: `Regel ${n + 1}: vul de prijs in euro's in (bijvoorbeeld 12,50).` };
    regels.push({ omschrijving: r.omschrijving, aantal, eenheid: r.eenheid, prijsCent, btw: r.btw });
  }
  let kortingPct: number | null = null;
  if (f.korting.trim()) {
    const p = Number(f.korting.trim().replace(",", "."));
    if (!Number.isFinite(p)) return { fout: "De korting is een percentage, bijvoorbeeld 10 of 7,5." };
    kortingPct = p;
  }
  return { body: { klant: { naam: f.naam, email: f.email, telefoon: f.telefoon, adres: f.adres }, titel: f.titel, inleiding: f.inleiding, regels, kortingPct, geldigTot: f.geldigTot, voorwaarden: f.voorwaarden } };
}

async function api(url: string, method: string, body?: unknown): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; fout: string }> {
  try {
    const res = await fetch(url, { method, cache: "no-store", ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
    const d = (await res.json().catch(() => null)) as (Record<string, unknown> & { error?: { message?: string } }) | null;
    if (!res.ok) return { ok: false, fout: d?.error?.message ?? "Dat lukte niet. Vernieuw de pagina en probeer het opnieuw." };
    return { ok: true, data: d ?? {} };
  } catch {
    return { ok: false, fout: "Geen verbinding. Controleer je internet en probeer het opnieuw." };
  }
}

export function OffertesBeheer() {
  const [lading, setLading] = useState<Lading | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [filter, setFilter] = useState<"alle" | EffectieveStatus>("alle");
  const [zoek, setZoek] = useState("");
  const [editor, setEditor] = useState<{ id: string | null } | null>(null);
  const [link, setLink] = useState<{ nummer: string; url: string } | null>(null);
  const [gekopieerd, setGekopieerd] = useState(false);

  const laad = useCallback(async () => {
    const r = await api("/api/werkgever/offertes", "GET");
    if (!r.ok) {
      setFout(r.fout);
      return;
    }
    setFout(null);
    setLading(r.data as unknown as Lading);
  }, []);

  useEffect(() => {
    void laad();
  }, [laad]);

  const getoond = useMemo(() => {
    const q = zoek.trim().toLowerCase();
    return (lading?.offertes ?? []).filter((o) => (filter === "alle" || o.status === filter) && (!q || `${o.nummer} ${o.titel} ${o.klant.naam} ${o.klant.email}`.toLowerCase().includes(q)));
  }, [lading, filter, zoek]);

  const maakUrl = (token: string) => `${window.location.origin}/offerte/${token}`;

  async function actie(o: OfferteBeheer, a: string, bevestig?: string) {
    if (bevestig && !window.confirm(bevestig)) return;
    setFout(null);
    const r = await api(`/api/werkgever/offertes/${o.id}`, "POST", { actie: a });
    if (!r.ok) {
      setFout(r.fout);
      return;
    }
    const token = r.data["token"];
    if (typeof token === "string") {
      setLink({ nummer: o.nummer, url: maakUrl(token) });
      setGekopieerd(false);
    } else if (a === "intrekken" || a === "klant-wissen") setLink(null);
    await laad();
  }

  async function verwijder(o: OfferteBeheer) {
    if (!window.confirm(`Concept ${o.nummer} verwijderen? Dit kan niet ongedaan gemaakt worden.`)) return;
    const r = await api(`/api/werkgever/offertes/${o.id}`, "DELETE");
    if (!r.ok) setFout(r.fout);
    else await laad();
  }

  async function kopieer() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setGekopieerd(true);
    } catch {
      setFout("Kopiëren lukte niet. Selecteer de link hierboven en kopieer hem zelf.");
    }
  }

  if (!lading) {
    return fout ? (
      <p role="alert" className="rounded-xl bg-crit/10 px-4 py-3 text-sm text-crit">
        {fout}
      </p>
    ) : (
      <p className="text-sm text-neutralx-500">Laden…</p>
    );
  }

  if (editor) {
    const bestaand = editor.id ? lading.offertes.find((o) => o.id === editor.id) : undefined;
    return (
      <Editor
        key={editor.id ?? "nieuw"}
        begin={bestaand ? formulierVan(bestaand) : beginFormulier(lading.standaardGeldigTot)}
        nummer={bestaand?.nummer ?? null}
        id={editor.id}
        klaar={async (nieuw) => {
          setEditor(null);
          if (nieuw) setLink({ nummer: nieuw.nummer, url: maakUrl(nieuw.token) });
          setGekopieerd(false);
          await laad();
        }}
        annuleer={() => setEditor(null)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <p className="rounded-xl border border-hair bg-paper-soft px-4 py-3 text-sm text-neutralx-600">
        ZekerFlex verstuurt de offerte niet zelf: je maakt een link, kopieert hem en stuurt hem zelf naar je klant (mail, WhatsApp, wat je wilt). De klant bekijkt de offerte op die link en gaat akkoord of wijst af; je ziet dat hier terug.
      </p>

      {fout && (
        <p role="alert" className="rounded-xl bg-crit/10 px-4 py-3 text-sm text-crit">
          {fout}
        </p>
      )}

      {link && (
        <div className={`${kaart} space-y-2`} role="status">
          <p className="text-sm font-semibold text-ink">Link voor offerte {link.nummer}</p>
          <input readOnly aria-label={`Link voor offerte ${link.nummer}`} value={link.url} onFocus={(e) => e.currentTarget.select()} className="field-input w-full" />
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn-primary px-3 py-2 text-sm" onClick={() => void kopieer()}>
              {gekopieerd ? "Gekopieerd" : "Link kopiëren"}
            </button>
            <button type="button" className={knopKlein} onClick={() => setLink(null)}>
              Sluiten
            </button>
          </div>
          <p className="text-xs text-neutralx-500">Kopieer de link en stuur hem zelf naar je klant. Je ziet deze link alleen nu: we bewaren hem niet leesbaar. Kwijt? Kies bij de offerte &quot;Nieuwe link&quot;; de oude link werkt dan niet meer.</p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Filter op status" className="flex flex-wrap gap-1">
          {FILTERS.map((s) => (
            <button key={s} type="button" aria-pressed={filter === s} onClick={() => setFilter(s)} className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${filter === s ? "border-brand-600 bg-brand-50 text-brand-700" : "border-hairstrong text-ink hover:border-brand-500"}`}>
              {s === "alle" ? "Alle" : STATUS_NAAM[s]}
            </button>
          ))}
        </div>
        <label className="sr-only" htmlFor="of-zoek">
          Zoeken
        </label>
        <input id="of-zoek" type="search" className="field-input min-w-[10rem] flex-1" placeholder="Zoek op nummer, titel of klant" value={zoek} onChange={(e) => setZoek(e.target.value)} />
        <button type="button" className="btn-primary px-3 py-2 text-sm" onClick={() => setEditor({ id: null })}>
          Nieuwe offerte
        </button>
      </div>

      {getoond.length === 0 ? (
        <p className={`${kaart} text-sm text-neutralx-500`}>{lading.offertes.length === 0 ? "Je hebt nog geen offertes. Maak je eerste offerte met de knop hierboven." : "Geen offertes gevonden met dit filter."}</p>
      ) : (
        <ul className="space-y-3">
          {getoond.map((o) => {
            const t = totalenVan(o);
            return (
              <li key={o.id} className={kaart}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-neutralx-500">
                      {o.nummer}
                      {o.kopieVan ? ` · kopie van ${o.kopieVan}` : ""}
                    </p>
                    <p className="font-semibold text-ink">{o.titel || "(geen titel)"}</p>
                    <p className="text-sm text-neutralx-600">
                      {o.klant.naam || "(nog geen klant)"} · geldig tot {nlDag(o.geldigTot)}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${KLEUR[o.status]}`}>{STATUS_NAAM[o.status]}</span>
                    <p className="mt-1 text-sm font-semibold text-ink">{euro(t.totaalCent)}</p>
                    <p className="text-xs text-neutralx-500">incl. btw</p>
                  </div>
                </div>
                {o.reactie && (
                  <p className="mt-2 text-sm text-neutralx-600">
                    {o.reactie.keuze === "geaccepteerd" ? "Akkoord van" : "Afgewezen door"} <span className="font-semibold text-ink">{o.reactie.naam || "de klant"}</span> op {nlMoment(o.reactie.op)}
                    {o.reactie.reden ? `. Reden: ${o.reactie.reden}` : ""}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {o.status === "concept" && (
                    <>
                      <button type="button" className={knopKlein} onClick={() => setEditor({ id: o.id })}>
                        Bewerken
                      </button>
                      <button type="button" className={knopKlein} onClick={() => void actie(o, "versturen")}>
                        Link maken
                      </button>
                      <button type="button" className={knopKlein} onClick={() => void verwijder(o)}>
                        Verwijderen
                      </button>
                    </>
                  )}
                  {(o.status === "verstuurd" || o.status === "verlopen") && (
                    <>
                      {o.status === "verstuurd" && (
                        <button type="button" className={knopKlein} onClick={() => void actie(o, "nieuwe-link", "Een nieuwe link maken? De oude link werkt dan niet meer.")}>
                          Nieuwe link
                        </button>
                      )}
                      <button type="button" className={knopKlein} onClick={() => void actie(o, "intrekken", "Offerte intrekken? De link werkt dan niet meer en de offerte wordt weer een concept.")}>
                        Intrekken
                      </button>
                    </>
                  )}
                  <button type="button" className={knopKlein} onClick={() => void actie(o, "kopie")}>
                    Kopie maken
                  </button>
                  <a className={knopKlein} href={`/werkgever/offertes/${o.id}/print`} target="_blank" rel="noopener">
                    Afdrukken
                  </a>
                  {!o.klantGewist && (
                    <button type="button" className={knopKlein} onClick={() => void actie(o, "klant-wissen", `Klantgegevens van ${o.nummer} wissen? Naam, adres, e-mail en telefoon verdwijnen en de link werkt niet meer. De bedragen blijven.`)}>
                      Klantgegevens wissen
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// --- offerte maken of bewerken ----------------------------------------------------------

function Editor({ begin, nummer, id, klaar, annuleer }: { begin: Formulier; nummer: string | null; id: string | null; klaar: (nieuw?: { nummer: string; token: string }) => void | Promise<void>; annuleer: () => void }) {
  const [f, setF] = useState<Formulier>(begin);
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);

  const zet = <K extends keyof Formulier>(k: K, v: Formulier[K]) => setF((x) => ({ ...x, [k]: v }));
  const zetRegel = (n: number, patch: Partial<RegelVeld>) => setF((x) => ({ ...x, regels: x.regels.map((r, i) => (i === n ? { ...r, ...patch } : r)) }));

  const live = useMemo(() => {
    const regels = f.regels.flatMap((r) => {
      const aantal = aantalUitTekst(r.aantal);
      const prijsCent = r.prijs.trim() ? centUitTekst(r.prijs) : 0;
      return aantal !== null && prijsCent !== null && (r.omschrijving.trim() || r.prijs.trim()) ? [{ aantal, prijsCent, btw: r.btw }] : [];
    });
    const p = Number(f.korting.trim().replace(",", "."));
    const bp = f.korting.trim() && Number.isFinite(p) ? Math.round(Math.min(100, Math.max(0, p)) * 100) : 0;
    return berekenTotalen(regels, bp);
  }, [f.regels, f.korting]);

  async function bewaar(maakLink: boolean) {
    setFout(null);
    const r = naarBody(f);
    if ("fout" in r) {
      setFout(r.fout);
      return;
    }
    setBezig(true);
    const opgeslagen = await api(id ? `/api/werkgever/offertes/${id}` : "/api/werkgever/offertes", id ? "PUT" : "POST", r.body);
    if (!opgeslagen.ok) {
      setBezig(false);
      setFout(opgeslagen.fout);
      return;
    }
    if (!maakLink) {
      setBezig(false);
      await klaar();
      return;
    }
    const offerteId = (opgeslagen.data.offerte as OfferteBeheer).id;
    const v = await api(`/api/werkgever/offertes/${offerteId}`, "POST", { actie: "versturen" });
    setBezig(false);
    if (!v.ok) {
      setFout(`De offerte is bewaard als concept, maar de link maken lukte niet: ${v.fout}`);
      return;
    }
    await klaar({ nummer: (v.data.offerte as OfferteBeheer).nummer, token: String(v.data.token) });
  }

  const veld = "field-input w-full";
  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        void bewaar(false);
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-bold text-ink">{nummer ? `Offerte ${nummer} bewerken` : "Nieuwe offerte"}</h2>
        <button type="button" className={knopKlein} onClick={annuleer}>
          Terug naar de lijst
        </button>
      </div>

      <fieldset className={`${kaart} space-y-3`}>
        <legend className="px-1 text-sm font-semibold text-ink">Klant</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="of-k-naam" className="field-label">
              Naam
            </label>
            <input id="of-k-naam" className={veld} value={f.naam} maxLength={80} onChange={(e) => zet("naam", e.target.value)} />
          </div>
          <div>
            <label htmlFor="of-k-mail" className="field-label">
              E-mail (niet verplicht)
            </label>
            <input id="of-k-mail" type="email" className={veld} value={f.email} maxLength={120} onChange={(e) => zet("email", e.target.value)} />
          </div>
          <div>
            <label htmlFor="of-k-tel" className="field-label">
              Telefoon (niet verplicht)
            </label>
            <input id="of-k-tel" type="tel" className={veld} value={f.telefoon} maxLength={30} onChange={(e) => zet("telefoon", e.target.value)} />
          </div>
          <div>
            <label htmlFor="of-k-adres" className="field-label">
              Adres (niet verplicht)
            </label>
            <textarea id="of-k-adres" rows={2} className={veld} value={f.adres} maxLength={200} onChange={(e) => zet("adres", e.target.value)} />
          </div>
        </div>
        <p className="text-xs text-neutralx-500">Dit zijn gegevens van je klant. Je kunt ze later wissen met &quot;Klantgegevens wissen&quot; bij de offerte.</p>
      </fieldset>

      <fieldset className={`${kaart} space-y-3`}>
        <legend className="px-1 text-sm font-semibold text-ink">Offerte</legend>
        <div>
          <label htmlFor="of-titel" className="field-label">
            Titel
          </label>
          <input id="of-titel" className={veld} value={f.titel} maxLength={120} onChange={(e) => zet("titel", e.target.value)} />
        </div>
        <div>
          <label htmlFor="of-inl" className="field-label">
            Inleiding (niet verplicht)
          </label>
          <textarea id="of-inl" rows={3} className={veld} value={f.inleiding} maxLength={2000} onChange={(e) => zet("inleiding", e.target.value)} />
        </div>
        <div className="max-w-xs">
          <label htmlFor="of-geldig" className="field-label">
            Geldig tot
          </label>
          <input id="of-geldig" type="date" className={veld} value={f.geldigTot} onChange={(e) => zet("geldigTot", e.target.value)} />
          {f.geldigTot && <p className="mt-1 text-xs text-neutralx-500">{nlDag(f.geldigTot)}</p>}
        </div>
      </fieldset>

      <fieldset className={`${kaart} space-y-3`}>
        <legend className="px-1 text-sm font-semibold text-ink">Regels (prijzen exclusief btw)</legend>
        {f.regels.map((r, n) => (
          <div key={n} className="grid gap-2 border-b border-hair pb-3 sm:grid-cols-[1fr_5rem_5rem_6rem_5rem_auto] sm:items-end">
            <div>
              <label htmlFor={`of-r${n}-oms`} className="field-label">
                Omschrijving
              </label>
              <input id={`of-r${n}-oms`} className={veld} value={r.omschrijving} maxLength={200} onChange={(e) => zetRegel(n, { omschrijving: e.target.value })} />
            </div>
            <div>
              <label htmlFor={`of-r${n}-aantal`} className="field-label">
                Aantal
              </label>
              <input id={`of-r${n}-aantal`} inputMode="decimal" className={veld} value={r.aantal} onChange={(e) => zetRegel(n, { aantal: e.target.value })} />
            </div>
            <div>
              <label htmlFor={`of-r${n}-eenheid`} className="field-label">
                Eenheid
              </label>
              <input id={`of-r${n}-eenheid`} className={veld} value={r.eenheid} maxLength={20} onChange={(e) => zetRegel(n, { eenheid: e.target.value })} />
            </div>
            <div>
              <label htmlFor={`of-r${n}-prijs`} className="field-label">
                Prijs (€)
              </label>
              <input id={`of-r${n}-prijs`} inputMode="decimal" className={veld} value={r.prijs} placeholder="0,00" onChange={(e) => zetRegel(n, { prijs: e.target.value })} />
            </div>
            <div>
              <label htmlFor={`of-r${n}-btw`} className="field-label">
                Btw
              </label>
              <select id={`of-r${n}-btw`} className={veld} value={r.btw} onChange={(e) => zetRegel(n, { btw: Number(e.target.value) })}>
                {BTW_TARIEVEN.map((b) => (
                  <option key={b} value={b}>
                    {b}%
                  </option>
                ))}
              </select>
            </div>
            <button type="button" className={knopKlein} aria-label={`Regel ${n + 1} verwijderen`} onClick={() => setF((x) => ({ ...x, regels: x.regels.filter((_, i) => i !== n) }))}>
              Weg
            </button>
          </div>
        ))}
        <button type="button" className={knopKlein} disabled={f.regels.length >= MAX_REGELS} onClick={() => setF((x) => ({ ...x, regels: [...x.regels, leegRegel()] }))}>
          Regel toevoegen
        </button>
        <div className="max-w-xs">
          <label htmlFor="of-korting" className="field-label">
            Korting over het geheel (%, niet verplicht)
          </label>
          <input id="of-korting" inputMode="decimal" className={veld} value={f.korting} placeholder="0" onChange={(e) => zet("korting", e.target.value)} />
        </div>

        <dl className="ml-auto w-full max-w-xs space-y-1 text-sm" aria-live="polite">
          <div className="flex justify-between gap-4">
            <dt className="text-neutralx-600">Subtotaal</dt>
            <dd>{euro(live.subtotaalCent)}</dd>
          </div>
          {live.kortingCent > 0 && (
            <div className="flex justify-between gap-4">
              <dt className="text-neutralx-600">Korting</dt>
              <dd>-{euro(live.kortingCent)}</dd>
            </div>
          )}
          {live.tarieven
            .filter((x) => x.btw > 0)
            .map((x) => (
              <div key={x.btw} className="flex justify-between gap-4">
                <dt className="text-neutralx-600">Btw {x.btw}%</dt>
                <dd>{euro(x.btwCent)}</dd>
              </div>
            ))}
          <div className="flex justify-between gap-4 border-t border-hairstrong pt-1 font-bold text-ink">
            <dt>Totaal incl. btw</dt>
            <dd>{euro(live.totaalCent)}</dd>
          </div>
        </dl>
      </fieldset>

      <div className={kaart}>
        <label htmlFor="of-vw" className="field-label">
          Voorwaarden (niet verplicht)
        </label>
        <textarea id="of-vw" rows={5} className={veld} value={f.voorwaarden} maxLength={MAX_VOORWAARDEN} onChange={(e) => zet("voorwaarden", e.target.value)} />
        <p className="mt-1 text-xs text-neutralx-500">
          {f.voorwaarden.length} van {MAX_VOORWAARDEN} tekens
        </p>
      </div>

      {fout && (
        <p role="alert" className="rounded-xl bg-crit/10 px-4 py-3 text-sm text-crit">
          {fout}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn-primary px-4 py-2 text-sm" disabled={bezig}>
          {bezig ? "Bezig…" : "Opslaan als concept"}
        </button>
        <button type="button" className="rounded-lg border border-hairstrong px-4 py-2 text-sm font-semibold text-ink hover:border-brand-500" disabled={bezig} onClick={() => void bewaar(true)}>
          Opslaan en link maken
        </button>
      </div>
    </form>
  );
}
