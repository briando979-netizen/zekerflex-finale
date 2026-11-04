"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { foutVan, stuur } from "@/components/rijschool/api";
import { Melding, Veld } from "@/components/rijschool/ui";
import { MODULES } from "@/lib/horeca/modules";
import { APPARAAT_LABEL, SCHERMEN, SCHERM_ROLLEN, schermBeschikbaar, toonKoppelcode, type ApparaatSoort, type SchermRol } from "@/lib/horeca/schermen";
import { amsterdamClock } from "@/lib/time/amsterdam";
import { isAan, type ApparaatRij } from "@/components/horeca/live/types";
import type { BeheerData } from "@/components/horeca/beheer/types";

// ---------------------------------------------------------------------------
// Tabblad Schermen: de kant-en-klare schermen (handheld, keuken, bar, uitgifte,
// ontvangst, afhaal, live-overzicht) en de gekoppelde apparaten. Koppelen gaat
// zonder account: maak een apparaat aan, open /scherm op het apparaat en tik
// de code in of scan de QR-code. Ontkoppelen werkt meteen.
// ---------------------------------------------------------------------------

const API = "/api/horeca/beheer";
const STANDAARD_NAAM: Record<SchermRol, string> = {
  bediening: "Telefoon bediening",
  keuken: "Tablet keuken",
  bar: "Tablet bar",
  uitgifte: "Scherm uitgifte",
  ontvangst: "Tablet ontvangst",
  afhaal: "Tv afhalen",
  overzicht: "Tv kantoor",
};

interface Koppel {
  code: string;
  tot: string;
  id: string;
}

/** Een schets van het scherm op zijn apparaat: zo ziet het eruit. */
function Model({ rol }: { rol: SchermRol }) {
  const soort: ApparaatSoort = SCHERMEN[rol].apparaten[0] ?? "tablet";
  const lijst = soort === "handheld";
  const frame = lijst ? "h-36 w-20 rounded-[14px] p-1.5" : soort === "tv" ? "h-24 w-40 rounded-md p-1.5" : "h-28 w-40 rounded-xl p-2";
  const blok = (k: string, i: number) => <span key={i} className={`rounded-[3px] ${k}`} />;
  let inhoud;
  if (rol === "keuken" || rol === "bar" || rol === "uitgifte") {
    const kleuren = rol === "uitgifte" ? ["bg-[#22C55E]", "bg-[#22C55E]", "bg-[#22C55E]", "bg-white/20"] : ["bg-[#F59E0B]", "bg-[#22C55E]", "bg-[#22C55E]", "bg-[#EF4444]"];
    inhoud = <span className="grid h-full grid-cols-4 gap-1">{kleuren.map((k, i) => <span key={i} className="flex flex-col gap-0.5 rounded-[3px] bg-white/10 p-0.5">{[blok(k, 0), blok("h-1 bg-white/40", 1), blok("h-1 bg-white/40", 2), blok("h-1 w-2/3 bg-white/40", 3)]}</span>)}</span>;
  } else if (rol === "afhaal") {
    inhoud = (
      <span className="grid h-full grid-cols-2 gap-1">
        <span className="flex flex-col items-center justify-center gap-0.5 rounded-[3px] bg-white/10 text-[8px] font-bold text-white/70">
          12 · 14
        </span>
        <span className="flex flex-col items-center justify-center gap-0.5 rounded-[3px] bg-[#06311A] text-[11px] font-bold text-[#86EFAC]">9</span>
      </span>
    );
  } else if (rol === "bediening" || rol === "ontvangst") {
    const tegels = ["bg-[#06311A]", "bg-white/10", "bg-[#13254A]", "bg-[#3A2203]", "bg-white/10", "bg-[#33260A]"];
    inhoud = (
      <span className="flex h-full flex-col gap-1">
        <span className={`grid flex-1 gap-1 ${lijst ? "grid-cols-2" : "grid-cols-3"}`}>{tegels.map((k, i) => blok(k, i))}</span>
        <span className="h-2 rounded-[3px] bg-white/20" />
      </span>
    );
  } else {
    inhoud = (
      <span className="flex h-full flex-col gap-1">
        <span className="grid grid-cols-4 gap-1">{["bg-[#F5C451]/70", "bg-white/25", "bg-white/25", "bg-white/25"].map((k, i) => <span key={i} className={`h-3 rounded-[3px] ${k}`} />)}</span>
        <span className="grid flex-1 grid-cols-6 gap-1">{["bg-[#06311A]", "bg-white/10", "bg-[#13254A]", "bg-white/10", "bg-[#3A2203]", "bg-white/10"].map((k, i) => blok(k, i))}</span>
      </span>
    );
  }
  return (
    <span className="flex flex-col items-center" aria-hidden>
      <span className={`block bg-[#1E2421] shadow-card ${frame}`}>
        <span className="block h-full w-full overflow-hidden rounded-[6px] bg-[#0B0F0D] p-1">{inhoud}</span>
      </span>
      {soort === "tv" && <span className="h-2 w-10 rounded-b-md bg-[#1E2421]" />}
    </span>
  );
}

export function SchermenTab({ data }: { data: BeheerData }) {
  const modules = data.zaak.modules;
  const beschikbaar = SCHERM_ROLLEN.filter((r) => schermBeschikbaar(r, modules));
  const [apparaten, setApparaten] = useState<ApparaatRij[] | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [rol, setRol] = useState<SchermRol>(beschikbaar[0] ?? "overzicht");
  const [naam, setNaam] = useState(STANDAARD_NAAM[beschikbaar[0] ?? "overzicht"]);
  const [naamAangepast, setNaamAangepast] = useState(false);
  const [koppel, setKoppel] = useState<Koppel | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);

  const laad = useCallback(async () => {
    try {
      setApparaten((await stuur<{ apparaten: ApparaatRij[] }>(`${API}?alleen=apparaten`)).apparaten);
    } catch (e) {
      setFout(foutVan(e));
    }
  }, []);
  // terwijl er een code openstaat vaker kijken, zodat je ziet dat het apparaat gekoppeld is
  const wachtOpKoppelen = koppel !== null;
  useEffect(() => {
    void laad();
    const t = window.setInterval(() => void laad(), wachtOpKoppelen ? 4000 : 30_000);
    return () => window.clearInterval(t);
  }, [laad, wachtOpKoppelen]);

  // QR-code naar /scherm?code=… (in de browser gemaakt, alleen als er een code is)
  useEffect(() => {
    setQr(null);
    if (!koppel) return;
    let weg = false;
    void import("qrcode").then(({ default: QR }) =>
      QR.toString(`${window.location.origin}/scherm?code=${koppel.code}`, { type: "svg", margin: 1, errorCorrectionLevel: "M" }).then((svg) => {
        if (!weg) setQr(svg);
      }),
    );
    return () => {
      weg = true;
    };
  }, [koppel]);

  async function post(body: Record<string, unknown>, okTekst?: string) {
    setFout(null);
    setOk(null);
    try {
      const r = await stuur<{ apparaten: ApparaatRij[]; koppel?: Koppel | null }>(API, "POST", body);
      setApparaten(r.apparaten);
      if (r.koppel) setKoppel(r.koppel);
      if (okTekst) setOk(okTekst);
      return true;
    } catch (e) {
      setFout(foutVan(e));
      return false;
    }
  }

  async function maak(e: FormEvent) {
    e.preventDefault();
    setBezig(true);
    if (await post({ actie: "apparaat", naam, rol })) {
      setNaamAangepast(false);
    }
    setBezig(false);
  }

  const kiesRol = (r: SchermRol) => {
    setRol(r);
    if (!naamAangepast) setNaam(STANDAARD_NAAM[r]);
  };
  const nu = Date.now();
  const adres = `${window.location.host}/scherm`;
  const gekoppeld = koppel ? apparaten?.find((a) => a.id === koppel.id) : undefined;

  return (
    <div className="space-y-5">
      <section className="card p-5" aria-labelledby="koppel-kop">
        <h2 id="koppel-kop" className="font-display text-lg font-bold text-ink">
          Een apparaat koppelen
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-neutralx-600">
          Elk apparaat in de zaak opent zijn eigen scherm: de telefoon van de bediening, de tablet in de keuken, een tv bij de balie. Personeel heeft geen account nodig. Kies het scherm, maak een code en open op het apparaat <strong className="text-ink">{adres}</strong>.
        </p>
        <form onSubmit={(e) => void maak(e)} className="mt-4 space-y-4">
          <fieldset>
            <legend className="field-label">Welk scherm?</legend>
            <div className="mt-1 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {SCHERM_ROLLEN.map((r) => {
                const s = SCHERMEN[r];
                const kan = schermBeschikbaar(r, modules);
                return (
                  <label key={r} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${rol === r ? "border-brand-600 ring-2 ring-brand-600/30" : "border-hair"} ${kan ? "bg-white" : "cursor-not-allowed bg-paper-soft opacity-70"}`}>
                    <input type="radio" name="scherm-rol" className="mt-1 accent-brand-600" checked={rol === r} disabled={!kan} onChange={() => kiesRol(r)} />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-ink">{s.naam}</span>
                      <span className="block text-xs text-neutralx-600">{kan ? s.apparaten.map((a) => APPARAAT_LABEL[a]).join(" of ") : `Zet eerst ${s.modules.map((m) => MODULES[m].naam).join(" of ")} aan`}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-full max-w-xs">
              <Veld label="Naam van het apparaat">
                <input
                  className="field-input"
                  value={naam}
                  onChange={(e) => {
                    setNaam(e.target.value);
                    setNaamAangepast(true);
                  }}
                  required
                  maxLength={40}
                />
              </Veld>
            </div>
            <button type="submit" className="btn-primary" disabled={bezig || !schermBeschikbaar(rol, modules)}>
              {bezig ? "Bezig…" : "Maak koppelcode"}
            </button>
          </div>
        </form>
        <div className="mt-3">
          <Melding fout={fout} ok={ok} />
        </div>

        {koppel && (
          <div className="mt-5 grid gap-5 rounded-2xl border-2 border-brand-600 bg-white p-5 md:grid-cols-[auto_1fr]" role="status" aria-live="polite">
            <div className="mx-auto w-44" aria-hidden>
              {qr ? <div dangerouslySetInnerHTML={{ __html: qr }} /> : <div className="grid h-44 place-items-center text-xs text-neutralx-500">QR maken…</div>}
            </div>
            <div>
              <p className="text-sm font-semibold text-neutralx-600">Koppelcode{gekoppeld ? ` voor ${gekoppeld.naam}` : ""}</p>
              <p className="mt-1 font-mono text-5xl font-bold tracking-[0.12em] text-ink">{toonKoppelcode(koppel.code)}</p>
              <p className="mt-1 text-sm text-neutralx-600">Geldig tot {amsterdamClock(koppel.tot)}, één keer te gebruiken.</p>
              <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-ink">
                <li>
                  Scan de QR-code met het apparaat, of open <strong>{adres}</strong> en tik de code in.
                </li>
                <li>Het apparaat opent meteen zijn scherm en blijft gekoppeld, ook na herstarten.</li>
                <li>Tip: kies in de browser &quot;Zet op beginscherm&quot;; dan opent het als een app, zonder adresbalk.</li>
              </ol>
              {gekoppeld?.gekoppeld && Date.parse(gekoppeld.gekoppeld) > Date.parse(koppel.tot) - 15 * 60_000 && <p className="mt-3 pill-ok">Gekoppeld om {amsterdamClock(gekoppeld.gekoppeld)}</p>}
              <button type="button" className="btn-ghost mt-3" onClick={() => setKoppel(null)}>
                Klaar
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="card p-5" aria-labelledby="apparaten-kop">
        <h2 id="apparaten-kop" className="font-display text-lg font-bold text-ink">
          Gekoppelde apparaten
        </h2>
        {apparaten === null ? (
          <p className="mt-2 text-sm text-neutralx-500">Laden…</p>
        ) : apparaten.length === 0 ? (
          <p className="mt-2 text-sm text-neutralx-600">Nog geen apparaten. Koppel er hierboven een.</p>
        ) : (
          <ul className="mt-3 divide-y divide-hair">
            {apparaten.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 py-3">
                <span className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${isAan(a, nu) ? "bg-emerald-500" : "bg-neutralx-300"}`} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-ink">{a.naam}</span>
                  <span className="block text-xs text-neutralx-600">
                    {SCHERMEN[a.rol].naam} · {isAan(a, nu) ? "nu aan" : a.gezien ? `laatst gezien ${new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" }).format(new Date(a.gezien))}` : a.gekoppeld ? "gekoppeld, nog niet gezien" : "wacht op koppelen"}
                  </span>
                </span>
                <label className="sr-only" htmlFor={`rol-${a.id}`}>
                  Scherm van {a.naam}
                </label>
                <select id={`rol-${a.id}`} className="field-input w-auto" value={a.rol} onChange={(e) => void post({ actie: "apparaat", id: a.id, naam: a.naam, rol: e.target.value }, `${a.naam} opent nu ${SCHERMEN[e.target.value as SchermRol].naam}.`)}>
                  {SCHERM_ROLLEN.filter((r) => schermBeschikbaar(r, modules) || r === a.rol).map((r) => (
                    <option key={r} value={r}>
                      {SCHERMEN[r].naam}
                    </option>
                  ))}
                </select>
                <button type="button" className="btn-ghost" onClick={() => void post({ actie: "apparaat-code", id: a.id })}>
                  Nieuwe code<span className="sr-only"> voor {a.naam}</span>
                </button>
                <button
                  type="button"
                  className="btn-ghost text-crit"
                  onClick={() => {
                    if (window.confirm(`${a.naam} ontkoppelen? Het scherm op dat apparaat stopt direct.`)) void post({ actie: "apparaat-weg", id: a.id }, `${a.naam} is ontkoppeld.`);
                  }}
                >
                  Ontkoppelen<span className="sr-only"> ({a.naam})</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="modellen-kop">
        <h2 id="modellen-kop" className="font-display text-lg font-bold text-ink">
          De schermen
        </h2>
        <p className="mt-1 text-sm text-neutralx-600">Kant-en-klaar voor elk apparaat. Probeer ze eerst hier: als beheerder open je elk scherm zonder te koppelen.</p>
        <ul className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {SCHERM_ROLLEN.map((r) => {
            const s = SCHERMEN[r];
            const kan = schermBeschikbaar(r, modules);
            return (
              <li key={r} className="card flex flex-col p-5">
                <div className="flex items-start gap-4">
                  <Model rol={r} />
                  <div className="min-w-0">
                    <h3 className="font-display text-base font-bold text-ink">{s.naam}</h3>
                    <p className="mt-0.5 text-sm text-neutralx-600">{s.kort}</p>
                    <p className="mt-1 text-xs font-semibold text-neutralx-500">
                      {s.apparaten.map((a) => APPARAAT_LABEL[a]).join(" · ")} · {s.stand === "staand" ? "staand" : s.stand === "liggend" ? "liggend" : "staand of liggend"}
                    </p>
                  </div>
                </div>
                <ul className="mt-3 flex-1 space-y-1 text-sm text-ink">
                  {s.punten.map((p) => (
                    <li key={p} className="flex gap-2">
                      <span className="text-ok" aria-hidden>
                        ✓
                      </span>
                      {p}
                    </li>
                  ))}
                </ul>
                <div className="mt-4">
                  {kan ? (
                    <a href={`/scherm/${r}`} target="_blank" rel="noopener" className="btn-ghost">
                      Open {s.naam.toLowerCase()}
                    </a>
                  ) : (
                    <p className="text-xs text-neutralx-500">Zet eerst {s.modules.map((m) => MODULES[m].naam).join(" of ")} aan (Modules & abonnement).</p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card p-5" aria-labelledby="hardware-kop">
        <h2 id="hardware-kop" className="font-display text-lg font-bold text-ink">
          Welke apparaten heb je nodig?
        </h2>
        <div className="mt-3 grid gap-4 text-sm md:grid-cols-3">
          <div>
            <p className="font-semibold text-ink">Bediening</p>
            <p className="mt-1 text-neutralx-600">Elke Android-telefoon of iPhone van de laatste vijf jaar. Een hoesje met polsband voorkomt vallen. Zet het scherm op het beginscherm, dan werkt het als een app.</p>
          </div>
          <div>
            <p className="font-semibold text-ink">Keuken, bar en uitgifte</p>
            <p className="mt-1 text-neutralx-600">Een tablet van 10 inch of groter in een houder aan de muur, of een monitor met een kleine pc. Het scherm blijft vanzelf aan zolang het open staat. Zet het geluid aan voor een seintje bij een nieuwe bon.</p>
          </div>
          <div>
            <p className="font-semibold text-ink">Tv voor gasten of kantoor</p>
            <p className="mt-1 text-neutralx-600">Elke smart-tv met een internetbrowser, of een HDMI-stick met browser. Afhaalscherm en live-overzicht wijzigen niets, dus ze kunnen veilig zichtbaar hangen.</p>
          </div>
        </div>
        <p className="mt-3 text-xs text-neutralx-500">Zorg voor goede wifi in keuken en zaal. Valt de verbinding even weg, dan blijft het scherm staan en haalt het daarna vanzelf de nieuwe stand op.</p>
      </section>
    </div>
  );
}
