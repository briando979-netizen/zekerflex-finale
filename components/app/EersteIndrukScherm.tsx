"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AvatarUpload } from "@/components/app/AvatarUpload";
import { useFT } from "@/components/i18n/useFT";
import { BEDRIJF_MAX, ERVARING_EERSTE_JAAR, FUNCTIE_MAX, OMSCHRIJVING_MAX } from "@/lib/werker/ervaring";

/**
 * "Maak een goede eerste indruk" (/dashboard/eerste-indruk): per stap een volledig scherm met een
 * donkere kop (terugknop, twee voortgangsstreepjes, sluitknop) en een wit paneel eronder.
 * Stap 1: profielfoto (1a leeg, 1b zodra er een foto is). Stap 2: werkervaring. Beide zijn
 * optioneel en blokkeren nooit het reageren op klussen; na "Opslaan" gaat de werker naar
 * /dashboard/klussen (daar staat de melding, alleen als reageren echt kan).
 * De kop heeft eigen kleuren (zoals het mobiele loginscherm); datums zijn maand + jaar in
 * twee keuzelijsten (werkt in elke browser en met een schermlezer).
 */
export function EersteIndrukScherm({
  userId,
  naam,
  heeftFoto: fotoStart,
  start,
  huidigJaar,
  huidigeMaand,
}: {
  userId: string;
  naam: string;
  heeftFoto: boolean;
  start: "foto" | "ervaring";
  huidigJaar: number;
  huidigeMaand: number;
}) {
  const t = useFT().eersteIndruk;
  const [stap, setStap] = useState<"foto" | "ervaring">(start);
  const [heeftFoto, setHeeftFoto] = useState(fotoStart);

  const nr = stap === "foto" ? 1 : 2;
  return (
    <div className="-mx-4 -mt-4 sm:mx-0 sm:mt-0 sm:overflow-hidden sm:rounded-3xl">
      <header className="bg-[linear-gradient(165deg,#0B3B3A_0%,#0E5C4A_55%,#0C0E12_100%)] px-6 pb-14 pt-5 text-white">
        <div className="flex items-center justify-between gap-3">
          {stap === "ervaring" ? (
            <button type="button" onClick={() => setStap("foto")} aria-label={t.back} className="grid h-10 w-10 place-items-center rounded-full bg-white/10 hover:bg-white/20">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ) : (
            <Link href="/dashboard/klussen" aria-label={t.back} className="grid h-10 w-10 place-items-center rounded-full bg-white/10 hover:bg-white/20">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          )}
          <div className="flex flex-1 justify-center gap-2" role="img" aria-label={t.stap(nr)}>
            <span className={`h-1.5 w-12 rounded-full ${nr === 1 ? "bg-brand-mint" : "bg-white/25"}`} />
            <span className={`h-1.5 w-12 rounded-full ${nr === 2 ? "bg-brand-mint" : "bg-white/25"}`} />
          </div>
          <Link href="/dashboard/klussen" aria-label={t.close} className="grid h-10 w-10 place-items-center rounded-full bg-white/10 hover:bg-white/20">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </Link>
        </div>
        <h1 className="mt-6 font-display text-3xl font-bold leading-tight">
          {stap === "foto" ? (heeftFoto ? t.foto.titleOk : t.foto.title) : t.ervaring.title}
        </h1>
      </header>

      <section className="-mt-6 min-h-[50vh] rounded-t-[28px] bg-paper px-6 pb-10 pt-8">
        <div className="mx-auto w-full max-w-md">
          {stap === "foto" ? (
            <div>
              <p className="text-sm leading-relaxed text-neutralx-700">{t.foto.body}</p>
              <div className="mt-8">
                <AvatarUpload
                  groot
                  userId={userId}
                  name={naam}
                  initialHasAvatar={fotoStart}
                  onChange={setHeeftFoto}
                  texts={{ upload: t.foto.upload, change: t.foto.change, busy: t.foto.busy, remove: t.foto.remove, hint: t.foto.hint, error: t.foto.error }}
                />
              </div>
              {heeftFoto && (
                <button type="button" onClick={() => setStap("ervaring")} className="btn-primary mt-8 block w-full py-3.5 text-center text-base">
                  {t.foto.next}
                </button>
              )}
              {!heeftFoto && (
                <button type="button" onClick={() => setStap("ervaring")} className="mt-8 block w-full py-2 text-center text-sm font-medium text-neutralx-500 underline hover:text-ink">
                  {t.foto.next}
                </button>
              )}
            </div>
          ) : (
            <ErvaringFormulier huidigJaar={huidigJaar} huidigeMaand={huidigeMaand} />
          )}
        </div>
      </section>
    </div>
  );
}

/** Stap 2: één werkervaring (of "Ik heb geen werkervaring"); de server controleert alles opnieuw. */
function ErvaringFormulier({ huidigJaar, huidigeMaand }: { huidigJaar: number; huidigeMaand: number }) {
  const t = useFT().eersteIndruk;
  const e = t.ervaring;
  const router = useRouter();
  const id = useId();
  const [geen, setGeen] = useState(false);
  const [functie, setFunctie] = useState("");
  const [bedrijf, setBedrijf] = useState("");
  const [huidig, setHuidig] = useState(false);
  const [vanMaand, setVanMaand] = useState(0);
  const [vanJaar, setVanJaar] = useState(0);
  const [totMaand, setTotMaand] = useState(0);
  const [totJaar, setTotJaar] = useState(0);
  const [omschrijving, setOmschrijving] = useState("");
  const [fouten, setFouten] = useState<Record<string, string>>({});
  const [algemeen, setAlgemeen] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);

  const jaren: number[] = [];
  for (let j = huidigJaar; j >= ERVARING_EERSTE_JAAR; j--) jaren.push(j);

  function controleer(): Record<string, string> {
    const f: Record<string, string> = {};
    if (!bedrijf.trim()) f["bedrijf"] = e.verplicht;
    if (!vanMaand || !vanJaar) f["van"] = e.verplicht;
    else if (vanJaar === huidigJaar && vanMaand > huidigeMaand) f["van"] = e.beginToekomst;
    if (!huidig) {
      if (!totMaand || !totJaar) f["tot"] = e.verplicht;
      else if (totJaar === huidigJaar && totMaand > huidigeMaand) f["tot"] = e.eindToekomst;
      else if (vanMaand && vanJaar && totJaar * 12 + totMaand < vanJaar * 12 + vanMaand) f["tot"] = e.eindVoorBegin;
    }
    return f;
  }

  async function opslaan(ev: React.FormEvent) {
    ev.preventDefault();
    if (bezig) return;
    setAlgemeen(null);
    const f = geen ? {} : controleer();
    setFouten(f);
    if (Object.keys(f).length > 0) return;
    setBezig(true);
    try {
      const body = geen
        ? { actie: "geen", geen: true }
        : {
            actie: "toevoegen",
            functie,
            bedrijf,
            vanMaand,
            vanJaar,
            nu: huidig,
            ...(huidig ? {} : { totMaand, totJaar }),
            omschrijving,
          };
      const r = await fetch("/api/me/ervaring", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) {
        const d = (await r.json().catch(() => null)) as { error?: { message?: string } } | null;
        setAlgemeen(d?.error?.message ?? e.error);
        return;
      }
      // door naar de klussen: daar staat de melding (alleen als reageren echt kan)
      router.push("/dashboard/klussen?eerste=1");
    } catch {
      setAlgemeen(e.error);
    } finally {
      setBezig(false);
    }
  }

  const rand = (k: string) => (fouten[k] ? "border-crit" : "border-hairstrong");
  const veld = "w-full rounded-xl border bg-white px-3 py-3 text-sm text-ink disabled:cursor-not-allowed disabled:bg-neutralx-100 disabled:text-neutralx-400";
  const foutRegel = (k: string) =>
    fouten[k] ? (
      <p id={`${id}-${k}-fout`} role="alert" className="mt-1 text-xs text-crit">
        {fouten[k]}
      </p>
    ) : null;
  const beschrijft = (k: string) => (fouten[k] ? { "aria-invalid": true, "aria-describedby": `${id}-${k}-fout` } : {});

  const datum = (
    k: "van" | "tot",
    label: string,
    maand: number,
    jaar: number,
    zetMaand: (n: number) => void,
    zetJaar: (n: number) => void,
    uit: boolean,
  ) => (
    <fieldset disabled={uit} className="min-w-0">
      <legend className="text-sm font-medium text-ink">{label}</legend>
      <div className={`mt-1 grid grid-cols-[1fr_1fr_auto] items-center gap-2 ${uit ? "opacity-70" : ""}`}>
        {uit && k === "tot" ? (
          <p className="col-span-3 rounded-xl border border-hairstrong bg-neutralx-100 px-3 py-3 text-sm text-neutralx-500">{e.heden}</p>
        ) : (
          <>
            <select aria-label={`${label}: ${e.maand}`} className={`${veld} ${rand(k)}`} value={maand} onChange={(x) => zetMaand(Number(x.target.value))} {...beschrijft(k)}>
              <option value={0}>{e.maand}</option>
              {t.months.map((m, i) => (
                <option key={m + i} value={i + 1}>{m}</option>
              ))}
            </select>
            <select aria-label={`${label}: ${e.jaar}`} className={`${veld} ${rand(k)}`} value={jaar} onChange={(x) => zetJaar(Number(x.target.value))} {...beschrijft(k)}>
              <option value={0}>{e.jaar}</option>
              {jaren.map((j) => (
                <option key={j} value={j}>{j}</option>
              ))}
            </select>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden className="text-neutralx-500">
              <rect x="3.5" y="5" width="17" height="15" rx="2.5" stroke="currentColor" strokeWidth="1.7" />
              <path d="M3.5 10h17M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
          </>
        )}
      </div>
      {foutRegel(k)}
    </fieldset>
  );

  return (
    <form onSubmit={opslaan} noValidate className="space-y-5">
      <p className="text-sm leading-relaxed text-neutralx-700">{e.intro}</p>

      <label className="flex items-center gap-2.5 text-sm font-medium text-ink">
        <input type="checkbox" checked={geen} onChange={(x) => { setGeen(x.target.checked); setFouten({}); }} className="h-5 w-5" />
        {e.geen}
      </label>

      <div>
        <label htmlFor={`${id}-functie`} className="text-sm font-medium text-ink">{e.functie}</label>
        <input id={`${id}-functie`} className={`${veld} mt-1 border-hairstrong`} value={functie} maxLength={FUNCTIE_MAX} disabled={geen} onChange={(x) => setFunctie(x.target.value)} autoComplete="organization-title" />
      </div>

      <div>
        <label htmlFor={`${id}-bedrijf`} className="text-sm font-medium text-ink">{e.bedrijf}</label>
        <input id={`${id}-bedrijf`} className={`${veld} mt-1 ${rand("bedrijf")}`} value={bedrijf} maxLength={BEDRIJF_MAX} disabled={geen} onChange={(x) => setBedrijf(x.target.value)} autoComplete="organization" {...beschrijft("bedrijf")} />
        {foutRegel("bedrijf")}
      </div>

      <label className="flex items-center gap-2.5 text-sm text-ink">
        <input type="checkbox" checked={huidig} disabled={geen} onChange={(x) => setHuidig(x.target.checked)} className="h-5 w-5" />
        {e.huidig}
      </label>

      {datum("van", e.van, vanMaand, vanJaar, setVanMaand, setVanJaar, geen)}
      {datum("tot", e.tot, totMaand, totJaar, setTotMaand, setTotJaar, geen || huidig)}

      <div>
        <label htmlFor={`${id}-omschrijving`} className="text-sm font-medium text-ink">{e.omschrijving}</label>
        <textarea
          id={`${id}-omschrijving`}
          className={`${veld} mt-1 border-hairstrong`}
          rows={4}
          maxLength={OMSCHRIJVING_MAX}
          disabled={geen}
          value={omschrijving}
          onChange={(x) => setOmschrijving(x.target.value)}
        />
        <p className="mt-1 text-right text-xs text-neutralx-400">{e.count(omschrijving.length, OMSCHRIJVING_MAX)}</p>
      </div>

      {algemeen && <p role="alert" className="rounded-xl border border-crit/30 bg-crit/5 px-3 py-2 text-sm text-crit">{algemeen}</p>}

      <button type="submit" disabled={bezig} className="btn-primary block w-full py-3.5 text-center text-base">
        {bezig ? e.busy : e.save}
      </button>
    </form>
  );
}
