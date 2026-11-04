"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { APPARAAT_LABEL, SCHERMEN, SCHERM_ROLLEN, leesKoppelcode, schermBeschikbaar, type SchermRol } from "@/lib/horeca/schermen";

// ---------------------------------------------------------------------------
// /scherm op een apparaat: de koppelcode intikken (groot, foutloos op een
// tablet), of meteen koppelen als de code uit de QR-code komt. Een gekoppeld
// apparaat ziet welk scherm het is; de beheerder kiest zelf een scherm.
// ---------------------------------------------------------------------------

export function SchermStart({
  code: beginCode,
  gekoppeld,
  eigenaar,
}: {
  code: string;
  gekoppeld: { naam: string; scherm: string; rol: SchermRol } | null;
  eigenaar: { zaak: string; modules: string[] } | null;
}) {
  const [code, setCode] = useState(beginCode);
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  const eenKeer = useRef(false);

  async function koppel(waarde: string) {
    setFout(null);
    if (!leesKoppelcode(waarde)) {
      setFout("Een koppelcode heeft zes tekens, bijvoorbeeld ABC-234.");
      return;
    }
    setBezig(true);
    try {
      const res = await fetch("/api/horeca/scherm/koppel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: waarde }) });
      const body = (await res.json().catch(() => null)) as { rol?: string; error?: { message?: string } } | null;
      if (!res.ok || !body?.rol) throw new Error(body?.error?.message ?? "Koppelen lukte niet. Probeer het opnieuw.");
      window.location.replace(`/scherm/${body.rol}`);
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Koppelen lukte niet. Probeer het opnieuw.");
      setBezig(false);
    }
  }

  // code uit de QR-code: meteen koppelen (alleen in de browser, nooit bij het ophalen van de link)
  useEffect(() => {
    if (eenKeer.current || !beginCode) return;
    eenKeer.current = true;
    void koppel(beginCode);
  }, [beginCode]);

  async function ontkoppel() {
    if (!window.confirm("Dit apparaat ontkoppelen? Je hebt daarna een nieuwe code nodig.")) return;
    await fetch("/api/horeca/scherm/koppel", { method: "DELETE" }).catch(() => undefined);
    window.location.replace("/scherm");
  }

  function verstuur(e: FormEvent) {
    e.preventDefault();
    void koppel(code);
  }

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-3xl flex-col justify-center gap-8 px-4 py-10 sm:px-8">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#86EFAC]">ZekerFlex Horeca</p>
        <h1 className="mt-2 font-display text-3xl font-bold text-white sm:text-4xl">Scherm koppelen</h1>
        <p className="mt-2 max-w-xl text-[#B8C4BD]">Tik de code in die je leidinggevende in het beheer maakte (Horeca → Schermen), of scan de QR-code. Dit apparaat opent daarna altijd zijn eigen scherm.</p>
      </header>

      {gekoppeld && (
        <section className="rounded-2xl bg-white/[0.06] p-5 ring-1 ring-white/15" aria-labelledby="gekoppeld-kop">
          <h2 id="gekoppeld-kop" className="text-lg font-bold text-white">
            Dit apparaat is gekoppeld
          </h2>
          <p className="mt-1 text-[#B8C4BD]">
            {gekoppeld.naam} · scherm {gekoppeld.scherm}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <a href={`/scherm/${gekoppeld.rol}`} className="rounded-full bg-[#22C55E] px-5 py-3 font-bold text-[#04130A]">
              Open {gekoppeld.scherm.toLowerCase()}
            </a>
            <button type="button" onClick={() => void ontkoppel()} className="rounded-full px-5 py-3 font-semibold text-[#FCA5A5] ring-1 ring-white/20 hover:bg-white/5">
              Ontkoppelen
            </button>
          </div>
        </section>
      )}

      <form onSubmit={verstuur} className="rounded-2xl bg-white/[0.04] p-5 ring-1 ring-white/10" aria-labelledby="code-kop">
        <h2 id="code-kop" className="text-lg font-bold text-white">
          {gekoppeld ? "Ander scherm koppelen" : "Koppelcode"}
        </h2>
        <label htmlFor="koppelcode" className="mt-3 block text-sm font-semibold text-[#B8C4BD]">
          Code van zes tekens
        </label>
        <div className="mt-2 flex flex-wrap gap-3">
          <input
            id="koppelcode"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            autoComplete="one-time-code"
            autoCapitalize="characters"
            spellCheck={false}
            inputMode="text"
            maxLength={9}
            placeholder="ABC-234"
            aria-invalid={fout ? true : undefined}
            aria-describedby={fout ? "koppel-fout" : undefined}
            className="w-56 rounded-xl border-0 bg-white px-4 py-3 font-mono text-3xl font-bold uppercase tracking-[0.15em] text-[#0B0F0D] placeholder:text-[#9BA8A1] focus:outline-none focus:ring-4 focus:ring-[#22C55E]/60"
          />
          <button type="submit" disabled={bezig} className="rounded-xl bg-[#22C55E] px-6 py-3 text-lg font-bold text-[#04130A] disabled:opacity-60">
            {bezig ? "Koppelen…" : "Koppelen"}
          </button>
        </div>
        {fout && (
          <p id="koppel-fout" role="alert" className="mt-3 rounded-lg bg-[#450A0A] px-3 py-2 text-sm font-semibold text-[#FECACA]">
            {fout}
          </p>
        )}
      </form>

      {eigenaar && (
        <section aria-labelledby="kies-kop">
          <h2 id="kies-kop" className="text-lg font-bold text-white">
            Als beheerder van {eigenaar.zaak}
          </h2>
          <p className="mt-1 text-sm text-[#B8C4BD]">Je opent elk scherm zonder koppelen, bijvoorbeeld om het eerst te proberen.</p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {SCHERM_ROLLEN.filter((r) => schermBeschikbaar(r, eigenaar.modules)).map((r) => (
              <li key={r}>
                <a href={`/scherm/${r}`} className="block rounded-xl bg-white/[0.06] p-4 ring-1 ring-white/10 hover:bg-white/10">
                  <span className="block font-bold text-white">{SCHERMEN[r].naam}</span>
                  <span className="block text-sm text-[#B8C4BD]">{SCHERMEN[r].kort}</span>
                  <span className="mt-1 block text-xs text-[#9BA8A1]">{SCHERMEN[r].apparaten.map((a) => APPARAAT_LABEL[a]).join(" · ")}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
