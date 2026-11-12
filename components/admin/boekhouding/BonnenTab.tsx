"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Empty, Notice, Panel, Pill } from "@/components/admin/kit";
import { API_BOEKHOUDING, boekApi, jsonInit } from "@/lib/boekhouding/scherm-api";
import { bedragTekst, centenInvoer, dagTekst, zekerheidTekst, type BonRij, type CategorieKeuze } from "@/lib/boekhouding/scherm-kern";

interface AdminKeuze {
  id: string;
  naam: string;
  soort: "ECHT" | "TEST";
}

type Open = "goedkeuren" | "afkeuren" | null;

function BonKaart({ bon, categorieen, onBon }: { bon: BonRij; categorieen: CategorieKeuze[]; onBon: (b: BonRij, melding: string) => void }) {
  const [open, setOpen] = useState<Open>(null);
  const [leverancier, setLeverancier] = useState(bon.leverancier ?? "");
  const [datum, setDatum] = useState(bon.bonDatum ?? "");
  const [totaal, setTotaal] = useState(centenInvoer(bon.totaalCents));
  const [btw, setBtw] = useState(bon.btwPercentage ?? 21);
  const [categorie, setCategorie] = useState(bon.rekeningNummer ?? "4900");
  const [ondanksDubbel, setOndanksDubbel] = useState(false);
  const [reden, setReden] = useState("");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const id = bon.id;
  const klaar = bon.status !== "EVEN_KIJKEN";

  const stuur = async (body: unknown, melding: string) => {
    setBezig(true);
    try {
      const r = await boekApi<{ bon: BonRij }>(`/bonnen/${encodeURIComponent(id)}`, jsonInit("PATCH", body));
      setFout(null);
      onBon(r.bon, melding);
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Dat lukte niet.");
    } finally {
      setBezig(false);
    }
  };

  if (klaar) {
    return (
      <li className="a-panel px-4 py-3 text-sm">
        <Pill tone={bon.status === "GEBOEKT" ? "ok" : "neutral"}>{bon.status === "GEBOEKT" ? "Geboekt" : "Afgekeurd"}</Pill>{" "}
        <span>{bon.leverancier ?? "Bon"} · {bedragTekst(bon.totaalCents, bon.valuta)}</span>
      </li>
    );
  }

  return (
    <li>
      <Panel
        title={bon.leverancier ?? "Leverancier onbekend"}
        subtitle={`Ontvangen op ${bon.ontvangen}`}
        actions={
          <span className="flex flex-wrap gap-1.5">
            {bon.dubbelVan && <Pill tone="warn">Mogelijk dubbel</Pill>}
            <Pill tone="neutral" dot={false}>{zekerheidTekst(bon.zekerheidPromille)}</Pill>
          </span>
        }
      >
        <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <dt style={{ color: "var(--a-mute)" }}>Afzender</dt>
            <dd className="break-words font-medium">{bon.afzender ?? "Zelf geüpload"}</dd>
          </div>
          <div>
            <dt style={{ color: "var(--a-mute)" }}>Datum op de bon</dt>
            <dd className="font-medium">{dagTekst(bon.bonDatum)}</dd>
          </div>
          <div>
            <dt style={{ color: "var(--a-mute)" }}>Bedrag</dt>
            <dd className="font-medium">
              {bedragTekst(bon.totaalCents, bon.valuta)}
              {bon.btwCents !== null && <span style={{ color: "var(--a-mute)" }}> (btw {bedragTekst(bon.btwCents, bon.valuta)})</span>}
            </dd>
          </div>
          <div>
            <dt style={{ color: "var(--a-mute)" }}>Voorgestelde categorie</dt>
            <dd className="font-medium">
              {bon.rekeningNummer ? (categorieen.find((c) => c.nummer === bon.rekeningNummer)?.naam ?? bon.rekeningNummer) : "nog geen voorstel"}
            </dd>
          </div>
        </dl>
        {bon.evenKijkenReden && (
          <div className="mt-3">
            <Notice tone="warn">Waarom jij moet kijken: {bon.evenKijkenReden}</Notice>
          </div>
        )}
        {bon.dubbelVan && (
          <div className="mt-3">
            <Notice tone="warn">Er is al een bon met dezelfde leverancier, datum en bedrag. Controleer of dit niet dezelfde bon is.</Notice>
          </div>
        )}
        {fout && (
          <div className="mt-3">
            <Notice tone="crit" role="alert">{fout}</Notice>
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <a className="a-btn" href={`${API_BOEKHOUDING}/bonnen/${encodeURIComponent(id)}/bestand`} target="_blank" rel="noopener noreferrer">
            Bon bekijken
          </a>
          <button type="button" className="a-btn a-btn-primary" aria-expanded={open === "goedkeuren"} onClick={() => setOpen(open === "goedkeuren" ? null : "goedkeuren")}>
            Goedkeuren
          </button>
          <button type="button" className="a-btn" aria-expanded={open === "afkeuren"} onClick={() => setOpen(open === "afkeuren" ? null : "afkeuren")}>
            Afkeuren
          </button>
        </div>

        {open === "goedkeuren" && (
          <div className="mt-4 space-y-3 border-t pt-4" style={{ borderColor: "var(--a-border)" }}>
            <p className="text-sm">Controleer wat er staat, verbeter wat niet klopt en boek de bon.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="a-label" htmlFor={`lev-${id}`}>
                Leverancier
                <input id={`lev-${id}`} className="a-input" value={leverancier} maxLength={120} onChange={(e) => setLeverancier(e.target.value)} />
              </label>
              <label className="a-label" htmlFor={`dat-${id}`}>
                Datum op de bon
                <input id={`dat-${id}`} type="date" className="a-input" value={datum} onChange={(e) => setDatum(e.target.value)} />
              </label>
              <label className="a-label" htmlFor={`tot-${id}`}>
                Totaalbedrag, inclusief btw
                <input id={`tot-${id}`} className="a-input" inputMode="decimal" value={totaal} placeholder="12,50" onChange={(e) => setTotaal(e.target.value)} />
              </label>
              <label className="a-label" htmlFor={`btw-${id}`}>
                Btw-tarief
                <select id={`btw-${id}`} className="a-input" value={btw} onChange={(e) => setBtw(Number(e.target.value))}>
                  <option value={21}>21%</option>
                  <option value={9}>9%</option>
                  <option value={0}>0% (geen btw)</option>
                </select>
              </label>
              <label className="a-label sm:col-span-2" htmlFor={`cat-${id}`}>
                Categorie
                <select id={`cat-${id}`} className="a-input" value={categorie} onChange={(e) => setCategorie(e.target.value)}>
                  {categorieen.map((c) => (
                    <option key={c.nummer} value={c.nummer}>{c.naam}</option>
                  ))}
                </select>
              </label>
            </div>
            {bon.dubbelVan && (
              <label className="flex items-start gap-2 text-sm" htmlFor={`dub-${id}`}>
                <input id={`dub-${id}`} type="checkbox" className="mt-1" checked={ondanksDubbel} onChange={(e) => setOndanksDubbel(e.target.checked)} />
                <span>Ja, dit is echt een aparte bon en geen dubbele.</span>
              </label>
            )}
            <button
              type="button"
              className="a-btn a-btn-primary"
              disabled={bezig}
              onClick={() =>
                void stuur(
                  { actie: "goedkeuren", velden: { leverancier, datum, totaal, btwPercentage: btw, categorie }, ondanksDubbel: ondanksDubbel || undefined },
                  "De bon is geboekt.",
                )
              }
            >
              {bezig ? "Bezig…" : "Bon boeken"}
            </button>
          </div>
        )}

        {open === "afkeuren" && (
          <div className="mt-4 space-y-3 border-t pt-4" style={{ borderColor: "var(--a-border)" }}>
            <label className="a-label" htmlFor={`red-${id}`}>
              Waarom keur je de bon af?
              <input id={`red-${id}`} className="a-input" value={reden} maxLength={500} placeholder="Bijvoorbeeld: geen bon, of niet voor ons" onChange={(e) => setReden(e.target.value)} />
            </label>
            <button type="button" className="a-btn a-btn-primary" disabled={bezig || reden.trim().length < 3} onClick={() => void stuur({ actie: "afkeuren", reden }, "De bon is afgekeurd.")}>
              {bezig ? "Bezig…" : "Bon afkeuren"}
            </button>
          </div>
        )}
      </Panel>
    </li>
  );
}

export function BonnenTab() {
  const [bonnen, setBonnen] = useState<BonRij[] | null>(null);
  const [categorieen, setCategorieen] = useState<CategorieKeuze[]>([]);
  const [administraties, setAdministraties] = useState<AdminKeuze[]>([]);
  const [fout, setFout] = useState<string | null>(null);
  const [melding, setMelding] = useState<string | null>(null);
  const [adminId, setAdminId] = useState("");
  const [bezig, setBezig] = useState(false);
  const bestandRef = useRef<HTMLInputElement>(null);

  const laad = useCallback(async () => {
    try {
      const [b, a] = await Promise.all([
        boekApi<{ bonnen: BonRij[]; categorieen: CategorieKeuze[] }>("/bonnen"),
        boekApi<{ administraties: AdminKeuze[] }>("/administraties"),
      ]);
      setBonnen(b.bonnen);
      setCategorieen(b.categorieen);
      setAdministraties(a.administraties);
      setAdminId((huidig) => huidig || (a.administraties[0]?.id ?? ""));
      setFout(null);
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Laden mislukt.");
    }
  }, []);
  useEffect(() => {
    void laad();
  }, [laad]);

  // De teruggegeven serverversie vervangt de bon in de lijst (of komt erbij na een upload).
  const neemOver = (b: BonRij, tekst: string) => {
    setBonnen((lijst) => {
      const huidig = lijst ?? [];
      return huidig.some((x) => x.id === b.id) ? huidig.map((x) => (x.id === b.id ? b : x)) : b.status === "EVEN_KIJKEN" ? [...huidig, b] : huidig;
    });
    setMelding(tekst);
  };

  const upload = async () => {
    const bestand = bestandRef.current?.files?.[0];
    if (!bestand) {
      setFout("Kies eerst een bestand (pdf, jpg, png of heic).");
      return;
    }
    setBezig(true);
    try {
      const form = new FormData();
      form.set("administratieId", adminId);
      form.set("bestand", bestand);
      const res = await fetch(`${API_BOEKHOUDING}/bonnen/upload`, { method: "POST", body: form });
      const data = (await res.json().catch(() => ({}))) as { error?: { message?: string }; bon?: BonRij; uitkomst?: { nieuw: boolean; status: string } };
      if (!res.ok || !data.bon || !data.uitkomst) throw new Error(data.error?.message ?? "Het uploaden is mislukt.");
      setFout(null);
      const tekst = !data.uitkomst.nieuw
        ? "Deze bon was al eerder aangeleverd. Er is niets nieuws gebeurd."
        : data.uitkomst.status === "GEBOEKT"
          ? "De bon is gelezen en vanzelf geboekt."
          : data.uitkomst.status === "AFGEWEZEN"
            ? "Deze bon was een dubbele en is afgewezen."
            : "De bon is gelezen en staat hieronder: kijk hem even na.";
      neemOver(data.bon, tekst);
      if (bestandRef.current) bestandRef.current.value = "";
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Het uploaden is mislukt.");
    } finally {
      setBezig(false);
    }
  };

  return (
    <div className="space-y-5">
      {fout && <Notice tone="crit" role="alert">{fout}</Notice>}
      {melding && <Notice tone="ok">{melding}</Notice>}
      <Panel title="Een bon uploaden" subtitle="Een pdf of foto (jpg, png, heic), hooguit 15 MB. Wat zeker klopt wordt vanzelf geboekt, de rest komt hieronder.">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="a-label" htmlFor="bon-admin">
            Voor welke administratie?
            <select id="bon-admin" className="a-input" value={adminId} onChange={(e) => setAdminId(e.target.value)}>
              {administraties.length === 0 && <option value="">Nog geen administratie</option>}
              {administraties.map((a) => (
                <option key={a.id} value={a.id}>{a.soort === "TEST" ? `${a.naam} (test)` : a.naam}</option>
              ))}
            </select>
          </label>
          <label className="a-label" htmlFor="bon-bestand">
            Bestand
            <input id="bon-bestand" ref={bestandRef} type="file" className="a-input" accept=".pdf,.jpg,.jpeg,.png,.heic,.heif,application/pdf,image/jpeg,image/png,image/heic" />
          </label>
        </div>
        <button type="button" className="a-btn a-btn-primary mt-3" disabled={bezig || !adminId} onClick={() => void upload()}>
          {bezig ? "Bezig met lezen…" : "Bon uploaden"}
        </button>
      </Panel>
      <section aria-label="Bonnen om na te kijken" className="space-y-4">
        {bonnen === null && !fout && <p className="text-sm">Laden…</p>}
        {bonnen !== null && bonnen.length === 0 && (
          <Panel title="Bonnen om na te kijken">
            <Empty title="Alles is nagekeken" body="Er ligt geen bon te wachten. Bonnen waar het systeem aan twijfelt komen hier te staan." />
          </Panel>
        )}
        <ul className="space-y-4">
          {(bonnen ?? []).map((b) => (
            <BonKaart key={b.id} bon={b} categorieen={categorieen} onBon={neemOver} />
          ))}
        </ul>
      </section>
    </div>
  );
}
