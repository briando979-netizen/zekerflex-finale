"use client";

import { useCallback, useEffect, useState } from "react";
import { Empty, Notice, Panel, Pill } from "@/components/admin/kit";
import { euro } from "@/lib/admin/format";
import { SHOP_CATEGORIEEN } from "@/lib/shop/categorieen";

// Beheer → Winkel-AI → Leverancier en Marges (18 nov 2026). Leverancier: de CJ-sleutel, zoeken in de
// catalogus (elektronica, speelgoed, cadeaus, kleding met kleuren en maten) en producten overnemen met
// foto's, Nederlandse tekst, varianten en een prijs uit de marge. Marges: wat elke verkoop oplevert.

type Stand = { ingesteld: boolean; bewijsGeldigTot: string | null; laatsteOk: string | null; laatsteFout: string | null; laatsteFoutOp: string | null; instellingen: { verzendCents: number; land: string; margePct: number | null } };
type Treffer = { pid: string; naamEn: string; foto: string | null; inkoopUsdCents: number; inkoopCents: number | null; prijsCents: number | null; categorie: string; categorieCj: string; gevoerd: number };
type Zoek = { producten: Treffer[]; totaal: number; pagina: number; gezochtOp?: string; vertaald?: boolean; land: string; margePct: number; verzendCents: number; koersDatum: string | null };
type Uitkomst = { pid: string } & ({ fout: string } | { bestaand: boolean; id: string; slug: string; naam: string; prijsCents: number; inkoopCents: number; varianten: number; fotos: number; vertaald: boolean; actief: boolean; verzendCents?: number; verzendEcht?: boolean; melding: string | null });

async function vraag<T>(url: string, body?: unknown, methode = body === undefined ? "GET" : "POST"): Promise<T> {
  const res = await fetch(url, { method: methode, headers: { "Content-Type": "application/json" }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const d = (await res.json().catch(() => ({}))) as { error?: { message?: string } } & T;
  if (!res.ok) throw new Error(d.error?.message ?? "Dat lukte niet. Probeer het nog eens.");
  return d;
}
const datum = (iso: string | null) => (iso ? new Date(iso).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam", dateStyle: "short", timeStyle: "short" }) : "–");

export function Leverancier() {
  const [stand, setStand] = useState<Stand | null>(null);
  const [sleutel, setSleutel] = useState("");
  const [fout, setFout] = useState<string | null>(null);
  const [bericht, setBericht] = useState<string | null>(null);
  const [bezig, setBezig] = useState<"" | "sleutel" | "zoek" | "import" | "oud" | "instel" | "bijwerk">("");
  const [q, setQ] = useState("");
  const [zoek, setZoek] = useState<Zoek | null>(null);
  const [gekozen, setGekozen] = useState<Set<string>>(new Set());
  const [meteenAan, setMeteenAan] = useState(true);
  const [categorie, setCategorie] = useState("");
  const [uitkomsten, setUitkomsten] = useState<Uitkomst[]>([]);
  const [verzendTekst, setVerzendTekst] = useState("");
  const [bijwerk, setBijwerk] = useState<{ bekeken: number; categorie: number; voorraad: number; vertaald: number; fouten: number; totaal: number; klaar: boolean } | null>(null);
  const [land, setLand] = useState("");
  const [margeTekst, setMargeTekst] = useState("");
  const [oudBewaard, setOudBewaard] = useState(0);

  const laad = useCallback(async () => {
    try {
      const s = await vraag<Stand>("/api/admin/shop-ai/cj/sleutel");
      setStand(s);
      setVerzendTekst((s.instellingen.verzendCents / 100).toFixed(2).replace(".", ","));
      setLand(s.instellingen.land);
      setMargeTekst(s.instellingen.margePct === null ? "" : String(s.instellingen.margePct));
      const o = await vraag<{ bewaard: number }>("/api/admin/shop-ai/cj/oud-uit");
      setOudBewaard(o.bewaard);
    } catch (e) {
      setFout((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void laad();
  }, [laad]);

  const doe = async (wat: typeof bezig, werk: () => Promise<void>) => {
    setBezig(wat);
    setFout(null);
    setBericht(null);
    try {
      await werk();
    } catch (e) {
      setFout((e as Error).message);
    } finally {
      setBezig("");
    }
  };

  const zoeken = (pagina = 1) =>
    doe("zoek", async () => {
      const r = await vraag<Zoek>("/api/admin/shop-ai/cj/zoek", { q, pagina });
      setZoek(r);
      setGekozen(new Set());
      if (!r.producten.length) setBericht("Niets gevonden. Probeer een ander (Engels) zoekwoord, bijvoorbeeld 'earbuds', 'plush toy' of 'hoodie'.");
    });

  const overnemen = (pids: string[]) =>
    doe("import", async () => {
      const alle: Uitkomst[] = [];
      for (let i = 0; i < pids.length; i += 5) {
        const r = await vraag<{ uitkomsten: Uitkomst[] }>("/api/admin/shop-ai/cj/importeer", { pids: pids.slice(i, i + 5), actief: meteenAan, ...(categorie ? { categorie } : {}) });
        alle.push(...r.uitkomsten);
        setUitkomsten([...alle]);
      }
      const goed = alle.filter((u) => !("fout" in u)).length;
      setBericht(`${goed} van ${pids.length} overgenomen${meteenAan ? ", en aan in de winkel als de foto gelukt is" : " (staan uit tot je ze aanzet)"}.`);
      setGekozen(new Set());
      // de vaste categoriekeuze geldt voor één overname; anders komt de volgende zoekopdracht ook in die categorie
      setCategorie("");
    });

  const wissel = (pid: string) =>
    setGekozen((g) => {
      const n = new Set(g);
      if (n.has(pid)) n.delete(pid);
      else n.add(pid);
      return n;
    });

  return (
    <div className="space-y-4">
      <Panel title="Koppeling met CJ Dropshipping" subtitle="Gratis met een CJ-account: 50.000 punten per dag (zoeken kost 50, een product 10). De sleutel blijft op de server.">
        {stand === null ? (
          <p className="text-sm" style={{ color: "var(--a-mute)" }}>Laden…</p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Pill tone={stand.ingesteld ? "ok" : "warn"}>{stand.ingesteld ? "Sleutel ingesteld" : "Nog geen sleutel"}</Pill>
              {stand.bewijsGeldigTot && <span style={{ color: "var(--a-mute)" }}>toegang geldig tot {datum(stand.bewijsGeldigTot)}</span>}
              {stand.laatsteOk && <span style={{ color: "var(--a-mute)" }}>· laatst gelukt {datum(stand.laatsteOk)}</span>}
            </div>
            {stand.laatsteFout && <Notice tone="warn">Laatste fout ({datum(stand.laatsteFoutOp)}): {stand.laatsteFout}</Notice>}
            {!stand.ingesteld && (
              <ol className="list-decimal space-y-1 pl-5 text-sm" style={{ color: "var(--a-text)" }}>
                <li>Maak een gratis account op cjdropshipping.com (op naam van het bedrijf).</li>
                <li>Ga naar My CJ → Authorization → API en klik op &quot;Generate&quot; (of &quot;Request&quot;). Je krijgt een lange sleutel.</li>
                <li>Plak die sleutel hieronder en klik op Opslaan. We proberen hem meteen; een foute sleutel wordt niet bewaard.</li>
              </ol>
            )}
            <form
              className="flex flex-col gap-2 sm:flex-row"
              onSubmit={(e) => {
                e.preventDefault();
                void doe("sleutel", async () => {
                  const s = await vraag<Omit<Stand, "instellingen">>("/api/admin/shop-ai/cj/sleutel", { sleutel }, "PUT");
                  setStand((v) => (v ? { ...v, ...s } : v));
                  setSleutel("");
                  setBericht("De sleutel werkt en is opgeslagen.");
                });
              }}
            >
              <input className="a-input flex-1" type="password" autoComplete="off" value={sleutel} onChange={(e) => setSleutel(e.target.value)} placeholder={stand.ingesteld ? "Nieuwe sleutel plakken om te vervangen" : "Plak hier de API-sleutel van CJ"} aria-label="CJ API-sleutel" />
              <button type="submit" className="a-btn a-btn-primary" disabled={bezig !== "" || sleutel.trim().length < 20}>{bezig === "sleutel" ? "Proberen…" : "Opslaan"}</button>
              {stand.ingesteld && (
                <button type="button" className="a-btn" disabled={bezig !== ""} onClick={() => void doe("sleutel", async () => { const s = await vraag<Omit<Stand, "instellingen">>("/api/admin/shop-ai/cj/sleutel", undefined, "DELETE"); setStand((v) => (v ? { ...v, ...s } : v)); })}>
                  Sleutel weghalen
                </button>
              )}
            </form>
            <details className="rounded-xl border p-3" style={{ borderColor: "var(--a-border)" }}>
              <summary className="cursor-pointer text-sm font-semibold" style={{ color: "var(--a-text)" }}>Instellingen: verzendkosten, magazijn en marge</summary>
              <form
                className="mt-3 grid gap-3 sm:grid-cols-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  void doe("instel", async () => {
                    const verzendCents = Math.round(Number(verzendTekst.replace(",", ".")) * 100);
                    const margePct = margeTekst.trim() === "" ? null : Number(margeTekst);
                    const r = await vraag<{ instellingen: Stand["instellingen"] }>("/api/admin/shop-ai/cj/sleutel", { verzendCents: Number.isFinite(verzendCents) ? verzendCents : 0, land: land.trim(), margePct: margePct !== null && Number.isFinite(margePct) ? margePct : null }, "PATCH");
                    setStand((v) => (v ? { ...v, instellingen: r.instellingen } : v));
                    setBericht("Instellingen opgeslagen. Ze gelden voor producten die je hierna overneemt.");
                  });
                }}
              >
                <label className="a-label">Verzendkosten per stuk (€)<input className="a-input" inputMode="decimal" value={verzendTekst} onChange={(e) => setVerzendTekst(e.target.value)} placeholder="4,50" /></label>
                <label className="a-label">Magazijn (landcode)<input className="a-input" value={land} onChange={(e) => setLand(e.target.value.toUpperCase())} placeholder="DE = Europa, leeg = overal" maxLength={2} /></label>
                <label className="a-label">Marge % (leeg = beleid Winkel-AI)<input className="a-input" inputMode="numeric" value={margeTekst} onChange={(e) => setMargeTekst(e.target.value)} placeholder="55" /></label>
                <div className="flex items-end"><button type="submit" className="a-btn" disabled={bezig !== ""}>Instellingen opslaan</button></div>
                <p className="text-xs sm:col-span-4" style={{ color: "var(--a-mute)" }}>De verkoopprijs = (inkoop in euro&apos;s + verzendkosten) met de marge erbovenop en de btw erbij, afgerond op x,95. Producten uit het Europese magazijn (DE) komen sneller en zonder invoerkosten.</p>
              </form>
            </details>
          </div>
        )}
      </Panel>

      {fout && <Notice tone="crit">{fout}</Notice>}
      {bericht && <Notice tone="ok">{bericht}</Notice>}

      <Panel title="Zoeken in de catalogus van CJ" subtitle="Typ gewoon Nederlands (speelgoed, oordopjes, tuinslang, hondenriem) of Engels; ZekerFlex zet het om voor de Engelse catalogus van CJ.">
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            void zoeken(1);
          }}
        >
          <input className="a-input flex-1" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Zoekwoord, Nederlands of Engels (bv. speelgoed, oordopjes, tuinslang)" aria-label="Zoekwoord" />
          <button type="submit" className="a-btn a-btn-primary" disabled={bezig !== "" || !stand?.ingesteld}>{bezig === "zoek" ? "Zoeken…" : "Zoeken"}</button>
        </form>
        {zoek && zoek.producten.length > 0 && (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center gap-3 text-sm" style={{ color: "var(--a-mute)" }}>
              <span>{zoek.totaal} gevonden{zoek.vertaald && zoek.gezochtOp ? ` (bij CJ gezocht op "${zoek.gezochtOp}")` : ""}{zoek.land ? `, met voorraad in ${zoek.land}` : ""} · marge {zoek.margePct} % · verzending geschat {euro(zoek.verzendCents)} per stuk (bij overnemen vraagt ZekerFlex het echte tarief naar NL op bij CJ){zoek.koersDatum ? ` · dollarkoers ${zoek.koersDatum}` : ""}</span>
              <label className="flex items-center gap-2" style={{ color: "var(--a-text)" }}><input type="checkbox" checked={meteenAan} onChange={(e) => setMeteenAan(e.target.checked)} /> Meteen aan in de winkel</label>
              <label className="flex items-center gap-2" style={{ color: "var(--a-text)" }}>
                Categorie
                <select className="a-input !w-auto" value={categorie} onChange={(e) => setCategorie(e.target.value)}>
                  <option value="">automatisch</option>
                  {SHOP_CATEGORIEEN.map((c) => <option key={c}>{c}</option>)}
                </select>
                {categorie && <span className="text-xs" style={{ color: "var(--a-mute)" }}>geldt voor álles wat je nu overneemt</span>}
              </label>
              <button type="button" className="a-btn" disabled={bezig !== "" || gekozen.size === 0} onClick={() => void overnemen([...gekozen])}>
                {bezig === "import" ? "Overnemen…" : `Gekozen overnemen (${gekozen.size})`}
              </button>
              <button type="button" className="a-btn" disabled={bezig !== ""} onClick={() => void overnemen(zoek.producten.map((p) => p.pid))}>Alle {zoek.producten.length} overnemen</button>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {zoek.producten.map((p) => (
                <li key={p.pid} className="rounded-xl border p-3" style={{ borderColor: gekozen.has(p.pid) ? "var(--a-accent, #52E0A4)" : "var(--a-border)" }}>
                  <label className="flex cursor-pointer gap-3">
                    <input type="checkbox" className="mt-1" checked={gekozen.has(p.pid)} onChange={() => wissel(p.pid)} aria-label={`Kies ${p.naamEn}`} />
                    <div className="min-w-0 flex-1">
                      <div className="aspect-square w-full overflow-hidden rounded-lg" style={{ background: "var(--a-soft, #eee)" }}>
                        {/* eslint-disable-next-line @next/next/no-img-element -- voorbeeldfoto van de leverancier via onze eigen route (de CSP van Beheer staat alleen eigen foto's toe); bij overnemen komt hij in onze opslag */}
                        {p.foto && <img src={`/api/admin/shop-ai/cj/foto?u=${encodeURIComponent(p.foto)}`} alt="" className="h-full w-full object-cover" loading="lazy" />}
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm font-semibold" style={{ color: "var(--a-text)" }}>{p.naamEn}</p>
                      <p className="text-xs" style={{ color: "var(--a-mute)" }}>{p.categorie}{p.categorieCj ? ` · CJ: ${p.categorieCj}` : ""}{p.gevoerd ? ` · ${p.gevoerd}× gevoerd` : ""}</p>
                      <p className="mt-1 text-sm" style={{ color: "var(--a-text)" }}>
                        inkoop ${(p.inkoopUsdCents / 100).toFixed(2)}{p.inkoopCents !== null ? ` ≈ ${euro(p.inkoopCents)}` : ""}
                        {p.prijsCents !== null && <> → verkoop <strong>{euro(p.prijsCents)}</strong></>}
                      </p>
                    </div>
                  </label>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <button type="button" className="a-btn" disabled={bezig !== "" || zoek.pagina <= 1} onClick={() => void zoeken(zoek.pagina - 1)}>Vorige</button>
              <button type="button" className="a-btn" disabled={bezig !== "" || zoek.pagina * 20 >= zoek.totaal} onClick={() => void zoeken(zoek.pagina + 1)}>Volgende</button>
            </div>
          </div>
        )}
        {zoek && zoek.producten.length === 0 && <div className="mt-4"><Empty title="Niets gevonden" body="Probeer een ander Engels zoekwoord." /></div>}
      </Panel>

      {uitkomsten.length > 0 && (
        <Panel title="Overgenomen" subtitle="Elke regel is een product in Beheer → Webshop. Tekst in het Engels? Dan lukte vertalen niet; pas hem daar aan.">
          <ul className="divide-y text-sm" style={{ borderColor: "var(--a-border)" }}>
            {uitkomsten.map((u) => (
              <li key={u.pid} className="flex flex-wrap items-center gap-2 py-2">
                {"fout" in u ? (
                  <><Pill tone="crit">mislukt</Pill><span style={{ color: "var(--a-text)" }}>{u.pid}: {u.fout}</span></>
                ) : (
                  <>
                    <Pill tone={u.actief ? "ok" : "warn"}>{u.bestaand ? "stond er al" : u.actief ? "aan" : "uit"}</Pill>
                    <a className="font-semibold underline" style={{ color: "var(--a-text)" }} href={`/shop/${u.slug}`} target="_blank" rel="noreferrer">{u.naam}</a>
                    <span style={{ color: "var(--a-mute)" }}>{euro(u.prijsCents)} (inkoop {euro(u.inkoopCents)}) · {u.varianten} varianten · {u.fotos} foto&apos;s{typeof u.verzendCents === "number" && !u.bestaand ? ` · verzending ${euro(u.verzendCents)}${u.verzendEcht ? " (tarief CJ)" : " (geschat)"}` : ""}{u.vertaald ? "" : " · nog Engels"}</span>
                    {u.melding && <span style={{ color: "var(--a-mute)" }}>· {u.melding}</span>}
                  </>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel title="Bijwerken vanuit CJ" subtitle="Loopt alle overgenomen producten langs: de categorie volgens de nieuwste regels, de echte voorraad per variant, en een tekst die nog Engels of half Duits is wordt opnieuw vertaald. Een categorie die je zelf koos ná een eerdere ronde blijft staan.">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="a-btn a-btn-primary"
            disabled={bezig !== ""}
            onClick={() =>
              void doe("bijwerk", async () => {
                let vanaf: number | null = 0;
                const som = { bekeken: 0, categorie: 0, voorraad: 0, vertaald: 0, fouten: 0, totaal: 0, klaar: false };
                while (vanaf !== null) {
                  const r = await vraag<{ bekeken: number; categorie: number; voorraad: number; vertaald: number; fouten: number; volgende: number | null; totaal: number }>("/api/admin/shop-ai/cj/bijwerken", { vanaf });
                  som.bekeken += r.bekeken;
                  som.categorie += r.categorie;
                  som.voorraad += r.voorraad;
                  som.vertaald += r.vertaald;
                  som.fouten += r.fouten;
                  som.totaal = r.totaal;
                  vanaf = r.volgende;
                  setBijwerk({ ...som });
                }
                som.klaar = true;
                setBijwerk({ ...som });
                setBericht(`Bijgewerkt: ${som.bekeken} van ${som.totaal} producten bekeken, ${som.categorie} van categorie gewisseld, ${som.voorraad} met nieuwe voorraad, ${som.vertaald} opnieuw vertaald${som.fouten ? `, ${som.fouten} mislukt` : ""}.`);
              })
            }
          >
            {bezig === "bijwerk" ? "Bezig…" : "Categorie, voorraad en tekst bijwerken"}
          </button>
          {bijwerk && !bijwerk.klaar && <span className="text-sm" style={{ color: "var(--a-mute)" }}>{bijwerk.bekeken} van {bijwerk.totaal} bekeken… (een paar seconden per product)</span>}
        </div>
      </Panel>

      <Panel title="Oude assortiment vervangen" subtitle="Zet alles uit wat niet van CJ komt (en niet van een verkoper is). Niets wordt gewist: met Terugzetten gaan precies die producten weer aan, of per stuk in Beheer → Webshop.">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="a-btn"
            disabled={bezig !== ""}
            onClick={() => {
              if (!window.confirm("Alle oude producten uitzetten? Ze blijven bestaan en gaan met Terugzetten weer aan.")) return;
              void doe("oud", async () => {
                const r = await vraag<{ aantal: number; bewaard: number }>("/api/admin/shop-ai/cj/oud-uit", { actie: "uit" });
                setOudBewaard(r.bewaard);
                setBericht(`${r.aantal} oude producten staan nu uit.`);
              });
            }}
          >
            {bezig === "oud" ? "Bezig…" : "Oude assortiment uitzetten"}
          </button>
          {oudBewaard > 0 && (
            <button
              type="button"
              className="a-btn"
              disabled={bezig !== ""}
              onClick={() =>
                void doe("oud", async () => {
                  const r = await vraag<{ aantal: number; bewaard: number }>("/api/admin/shop-ai/cj/oud-uit", { actie: "terug" });
                  setOudBewaard(r.bewaard);
                  setBericht(`${r.aantal} producten staan weer aan.`);
                })
              }
            >
              Terugzetten ({oudBewaard})
            </button>
          )}
        </div>
      </Panel>
    </div>
  );
}

type MargeRegel = { id: string; naam: string; slug: string; categorie: string; actief: boolean; voorraad: number; bron: string; verkoopCents: number; inkoopCents: number | null; verzendCents: number; btwCents: number; winstCents: number; margePct: number | null; verkochtStuks: number; verdiendCents: number };
type Marges = { regels: MargeRegel[]; totaal: { bestellingen: number; stuks: number; omzetCents: number; inkoopCents: number; winstCents: number }; zonderInkoop: number };

export function Marges() {
  const [d, setD] = useState<Marges | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [alleenAan, setAlleenAan] = useState(true);
  useEffect(() => {
    vraag<Marges>("/api/admin/shop-ai/marges").then(setD).catch((e: Error) => setFout(e.message));
  }, []);
  if (fout) return <Notice tone="crit">{fout}</Notice>;
  if (!d) return <p className="text-sm" style={{ color: "var(--a-mute)" }}>Laden…</p>;
  const regels = d.regels.filter((r) => !alleenAan || r.actief);
  const kaart = (naam: string, waarde: string) => (
    <div className="rounded-xl border p-3" style={{ borderColor: "var(--a-border)" }}>
      <p className="text-xs" style={{ color: "var(--a-mute)" }}>{naam}</p>
      <p className="text-lg font-bold" style={{ color: "var(--a-text)" }}>{waarde}</p>
    </div>
  );
  return (
    <div className="space-y-4">
      <Panel title="Verdiend tot nu toe" subtitle="Alleen betaalde bestellingen. Winst = verkoopprijs zonder btw, min inkoop en verzending.">
        <div className="grid gap-3 sm:grid-cols-5">
          {kaart("Bestellingen", String(d.totaal.bestellingen))}
          {kaart("Stuks", String(d.totaal.stuks))}
          {kaart("Omzet incl. btw", euro(d.totaal.omzetCents))}
          {kaart("Inkoop", euro(d.totaal.inkoopCents))}
          {kaart("Winst", euro(d.totaal.winstCents))}
        </div>
        {d.zonderInkoop > 0 && <p className="mt-3 text-sm" style={{ color: "var(--a-mute)" }}>{d.zonderInkoop} producten die aan staan hebben geen inkoopprijs; hun winst telt daardoor te hoog. Vul de inkoopprijs in bij Beheer → Webshop.</p>}
      </Panel>
      <Panel title="Per product: wat één verkoop oplevert" subtitle="Verkoop incl. btw → btw eraf → inkoop en verzending eraf = winst per stuk. Marge = winst als % van de prijs zonder btw.">
        <label className="mb-3 flex items-center gap-2 text-sm" style={{ color: "var(--a-text)" }}><input type="checkbox" checked={alleenAan} onChange={(e) => setAlleenAan(e.target.checked)} /> Alleen producten die aan staan</label>
        {regels.length === 0 ? (
          <Empty title="Geen producten" body="Neem producten over via Leverancier of maak er een in Beheer → Webshop." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left" style={{ color: "var(--a-mute)" }}>
                  <th className="py-2 pr-3">Product</th><th className="py-2 pr-3">Bron</th><th className="py-2 pr-3 text-right">Verkoop</th><th className="py-2 pr-3 text-right">Btw</th><th className="py-2 pr-3 text-right">Inkoop</th><th className="py-2 pr-3 text-right">Verzending</th><th className="py-2 pr-3 text-right">Winst/stuk</th><th className="py-2 pr-3 text-right">Marge</th><th className="py-2 pr-3 text-right">Verkocht</th><th className="py-2 text-right">Verdiend</th>
                </tr>
              </thead>
              <tbody style={{ color: "var(--a-text)" }}>
                {regels.map((r) => (
                  <tr key={r.id} className="border-t" style={{ borderColor: "var(--a-border)" }}>
                    <td className="py-2 pr-3"><a className="underline" href={`/shop/${r.slug}`} target="_blank" rel="noreferrer">{r.naam}</a>{!r.actief && <span className="ml-2 text-xs" style={{ color: "var(--a-mute)" }}>uit</span>}<span className="block text-xs" style={{ color: "var(--a-mute)" }}>{r.categorie}</span></td>
                    <td className="py-2 pr-3">{r.bron === "cj" ? "CJ" : r.bron === "verkoper" ? "verkoper" : "eigen"}</td>
                    <td className="py-2 pr-3 text-right">{euro(r.verkoopCents)}</td>
                    <td className="py-2 pr-3 text-right">{euro(r.btwCents)}</td>
                    <td className="py-2 pr-3 text-right">{r.inkoopCents === null ? "?" : euro(r.inkoopCents)}</td>
                    <td className="py-2 pr-3 text-right">{euro(r.verzendCents)}</td>
                    <td className="py-2 pr-3 text-right font-semibold" style={{ color: r.winstCents < 0 ? "var(--a-crit, #c0392b)" : "var(--a-text)" }}>{euro(r.winstCents)}</td>
                    <td className="py-2 pr-3 text-right">{r.margePct === null ? "?" : `${r.margePct} %`}</td>
                    <td className="py-2 pr-3 text-right">{r.verkochtStuks}</td>
                    <td className="py-2 text-right">{euro(r.verdiendCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
