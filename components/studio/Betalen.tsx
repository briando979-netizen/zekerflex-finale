"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useStudio } from "@/components/studio/context";
import { OpslaanBalk, Veld, veldProps } from "@/components/studio/WinkelVelden";
import { Card, PageHead, Pill, btn, input } from "@/components/studio/ui";
import { BTW_TARIEVEN, type BetaalMethode, type BtwTarief } from "@/lib/sites/types";
import { euro } from "@/lib/sites/euro";
import { BETAAL_METHODEN, BETAAL_NAAM, betaalPast, ibanGeldig, schoonIban, toonIban } from "@/lib/sites/winkel-betalen";
import { STANDAARD_BTW, btwIn } from "@/lib/sites/winkel-btw";
import { actieveVerzendmethoden } from "@/lib/sites/winkel-verzending";

// ---------------------------------------------------------------------------
// Webshop → Betalen: hoe klanten betalen en hoe de btw op een bestelling staat.
// Betaalmethoden zonder betaalprovider: bij het afhalen, per overboeking (de
// bedankpagina toont IBAN, bedrag, bestelnummer en een betaal-QR-code) en
// contant bij bezorgen. Online betalen (iDEAL) kan nog niet: dat staat er
// eerlijk bij, zonder knop. Btw: aan of uit, prijzen inclusief of exclusief,
// een standaardtarief (per product te wijzigen bij het product) of de KOR.
// Opslaan zet het meteen live (PATCH …/sites/winkel).
// ---------------------------------------------------------------------------

/** Wat de winkelier bij elke methode leest. */
const UITLEG: Record<BetaalMethode, string> = {
  afhalen: "Klanten betalen als ze de bestelling ophalen, op de manier die jij aanneemt. Alleen te kiezen bij afhalen.",
  overboeking: "Klanten maken het bedrag zelf over. Na het bestellen zien ze je IBAN, het bedrag, het bestelnummer als omschrijving en een betaal-QR-code voor hun bank-app. Jij zet de bestelling op Betaald zodra het geld binnen is.",
  rembours: "Klanten betalen contant aan de bezorger. Alleen te kiezen bij bezorgen.",
};

interface Staat {
  methoden: BetaalMethode[];
  iban: string;
  naam: string;
  tekst: string;
  btwAan: boolean;
  inclusief: boolean;
  standaard: BtwTarief;
  kor: boolean;
}

export default function Betalen() {
  const { winkel, saveWinkelDeel, data } = useStudio();
  const [basis, setBasis] = useState<Staat>(() => ({
    methoden: winkel.betalen?.methoden ?? [],
    iban: winkel.betalen ? toonIban(winkel.betalen.iban) : "",
    naam: winkel.betalen?.tenaamstelling ?? "",
    tekst: winkel.betaalTekst,
    btwAan: Boolean(winkel.btw),
    inclusief: (winkel.btw ?? STANDAARD_BTW).inclusief,
    standaard: (winkel.btw ?? STANDAARD_BTW).standaard,
    kor: (winkel.btw ?? STANDAARD_BTW).kor,
  }));
  const [s, setS] = useState<Staat>(basis);
  const [fouten, setFouten] = useState<{ iban?: string; naam?: string }>({});
  const [balkFout, setBalkFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<string | null>(null);

  const gewijzigd = JSON.stringify(s) !== JSON.stringify(basis);
  const zet = (patch: Partial<Staat>) => {
    setS((x) => ({ ...x, ...patch }));
    setMelding(null);
  };

  useEffect(() => {
    if (!gewijzigd) return;
    const waarschuw = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", waarschuw);
    return () => window.removeEventListener("beforeunload", waarschuw);
  }, [gewijzigd]);

  // past er bij elke verzendmethode die aan staat een betaalmethode?
  const methoden = actieveVerzendmethoden(winkel);
  const mist = (soort: "afhalen" | "bezorgen") => s.methoden.length > 0 && methoden.some((m) => m.soort === soort) && !s.methoden.some((b) => betaalPast(b, soort));

  const opslaan = async () => {
    const f: { iban?: string; naam?: string } = {};
    if (s.methoden.includes("overboeking")) {
      if (!ibanGeldig(s.iban)) f.iban = "Dit IBAN klopt niet. Controleer het nummer, bijvoorbeeld NL91 ABNA 0417 1643 00.";
      if (!s.naam.trim()) f.naam = "Vul de naam in waarop de rekening staat.";
    }
    setFouten(f);
    if (f.iban || f.naam) return setBalkFout("Niet alles klopt nog: kijk bij de rode velden.");
    const betalen = s.methoden.length || s.iban.trim() || s.naam.trim() ? { methoden: BETAAL_METHODEN.filter((m) => s.methoden.includes(m)), iban: schoonIban(s.iban), tenaamstelling: s.naam.trim() } : null;
    const btw = s.btwAan ? { inclusief: s.kor ? true : s.inclusief, standaard: s.standaard, kor: s.kor } : null;
    setBezig(true);
    const fout = await saveWinkelDeel({ betalen, btw, betaalTekst: s.tekst.trim() });
    setBezig(false);
    if (fout) return setBalkFout(fout);
    const nieuw = { ...s, iban: betalen ? toonIban(betalen.iban) : "", naam: s.naam.trim(), tekst: s.tekst.trim() };
    setBasis(nieuw);
    setS(nieuw);
    setBalkFout(null);
    setMelding("Opgeslagen. Het geldt meteen voor nieuwe bestellingen.");
  };
  const verwerp = () => {
    setS(basis);
    setFouten({});
    setBalkFout(null);
  };

  const zetMethode = (m: BetaalMethode, aan: boolean) => zet({ methoden: aan ? [...new Set([...s.methoden, m])] : s.methoden.filter((x) => x !== m) });
  // hoeveel producten op welk tarief staan (met het standaardtarief voor wie geen eigen tarief heeft)
  const perTarief = BTW_TARIEVEN.map((t) => ({ t, n: winkel.producten.filter((p) => (p.btw ?? s.standaard) === t).length })).filter((x) => x.n > 0);
  const voorbeeld = s.inclusief ? 1210 : 1000;

  return (
    <>
      <OpslaanBalk gewijzigd={gewijzigd} fout={balkFout} bezig={bezig} onOpslaan={() => void opslaan()} onVerwerp={verwerp} />
      <PageHead
        title="Betalen"
        sub={melding ? <span role="status" className="font-medium text-[#0c5132]">{melding}</span> : "Hoe klanten betalen en hoe de btw op hun bestelling staat. Het geld komt rechtstreeks bij jou."}
      />

      <div className="space-y-4">
        <Card title="Betaalmethoden">
          <ul className="space-y-3">
            {BETAAL_METHODEN.map((m) => {
              const aan = s.methoden.includes(m);
              return (
                <li key={m} className={`rounded-xl border p-3 sm:p-4 ${aan ? "border-[#1a1a1a]" : "border-[#ebebeb]"}`}>
                  <label className="flex items-start gap-3">
                    <input type="checkbox" checked={aan} onChange={(e) => zetMethode(m, e.target.checked)} className="mt-0.5 h-4 w-4 flex-shrink-0 accent-[#1a1a1a]" />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-[#1a1a1a]">{BETAAL_NAAM[m]}</span>
                      <span className="block text-sm text-[#616161]">{UITLEG[m]}</span>
                    </span>
                  </label>
                  {m === "overboeking" && aan && (
                    <div className="mt-3 grid gap-3 sm:ml-7 sm:grid-cols-2">
                      <Veld id="betalen-iban" label="IBAN" uitleg="Het rekeningnummer waar klanten naar overmaken." fout={fouten.iban}>
                        <input
                          {...veldProps("betalen-iban", fouten.iban)}
                          className={`${input} font-mono uppercase`}
                          value={s.iban}
                          maxLength={42}
                          placeholder="NL00 BANK 0123 4567 89"
                          autoComplete="off"
                          spellCheck={false}
                          onChange={(e) => zet({ iban: e.target.value.toUpperCase() })}
                          onBlur={() => ibanGeldig(s.iban) && zet({ iban: toonIban(s.iban) })}
                        />
                      </Veld>
                      <Veld id="betalen-naam" label="Ten name van" uitleg="Zoals de naam bij je bank staat." fout={fouten.naam}>
                        <input {...veldProps("betalen-naam", fouten.naam)} className={input} value={s.naam} maxLength={70} placeholder={data?.site?.bedrijf.naam ?? ""} onChange={(e) => zet({ naam: e.target.value })} />
                      </Veld>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {s.methoden.length === 0 && <p className="mt-3 text-sm text-[#616161]">Zonder betaalmethode kiezen klanten niets en zien ze alleen je uitleg hieronder, zoals tot nu toe.</p>}
          {mist("bezorgen") && (
            <p role="alert" className="mt-3 rounded-lg bg-[#ffeb78] px-3 py-2 text-sm text-[#4f4700]">
              Wie laat bezorgen, kan nu met geen enkele methode betalen. Zet Overboeking of Contant bij bezorgen aan.
            </p>
          )}
          {mist("afhalen") && (
            <p role="alert" className="mt-3 rounded-lg bg-[#ffeb78] px-3 py-2 text-sm text-[#4f4700]">
              Wie afhaalt, kan nu met geen enkele methode betalen. Zet Betalen bij afhalen of Overboeking aan.
            </p>
          )}
        </Card>

        <Card title="iDEAL en creditcard" actions={<Pill>Nog niet beschikbaar</Pill>}>
          <p className="text-sm text-[#616161]">Online betalen in je webshop kan nog niet, omdat ZekerFlex de koppeling met de betaalprovider (Stripe Connect) eerst moet afronden; tot die tijd betalen klanten op een van de manieren hierboven.</p>
        </Card>

        <Card title="Extra uitleg bij betalen">
          <Veld id="betalen-tekst" label="Deze tekst staat bij de controle van de bestelling en op de bedankpagina (mag leeg)" uitleg="Bijvoorbeeld: Bij afhalen kun je contant of met pin betalen.">
            <textarea {...veldProps("betalen-tekst", undefined)} className={`${input} min-h-[80px]`} maxLength={600} value={s.tekst} onChange={(e) => zet({ tekst: e.target.value })} />
          </Veld>
        </Card>

        <Card title="Btw">
          <label className="flex items-start gap-3">
            <input type="checkbox" checked={s.btwAan} onChange={(e) => zet({ btwAan: e.target.checked })} className="mt-0.5 h-4 w-4 accent-[#1a1a1a]" />
            <span>
              <span className="block text-sm font-semibold text-[#1a1a1a]">Btw op bestellingen tonen</span>
              <span className="block text-sm text-[#616161]">De controle, de bedankpagina en je mail tonen dan per tarief hoeveel btw er in de bestelling zit.</span>
            </span>
          </label>
          {s.btwAan && (
            <div className="mt-4 space-y-4 border-t border-[#f1f1f1] pt-4">
              <label className="flex items-start gap-3">
                <input type="checkbox" checked={s.kor} onChange={(e) => zet({ kor: e.target.checked })} className="mt-0.5 h-4 w-4 accent-[#1a1a1a]" />
                <span>
                  <span className="block text-sm font-semibold text-[#1a1a1a]">Ik gebruik de kleineondernemersregeling (KOR)</span>
                  <span className="block text-sm text-[#616161]">Dan reken je geen btw; bij de bestelling staat dat er geen btw in zit.</span>
                </span>
              </label>
              {!s.kor && (
                <>
                  <fieldset>
                    <legend className="mb-2 text-sm font-medium text-[#303030]">Je prijzen zijn</legend>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className={`flex items-start gap-3 rounded-xl border p-3 ${s.inclusief ? "border-[#1a1a1a]" : "border-[#ebebeb]"}`}>
                        <input type="radio" name="btw-soort" checked={s.inclusief} onChange={() => zet({ inclusief: true })} className="mt-0.5 h-4 w-4 accent-[#1a1a1a]" />
                        <span className="text-sm">
                          <span className="block font-semibold text-[#1a1a1a]">Inclusief btw</span>
                          <span className="block text-[#616161]">Voor consumenten. De btw zit al in de prijs.</span>
                        </span>
                      </label>
                      <label className={`flex items-start gap-3 rounded-xl border p-3 ${!s.inclusief ? "border-[#1a1a1a]" : "border-[#ebebeb]"}`}>
                        <input type="radio" name="btw-soort" checked={!s.inclusief} onChange={() => zet({ inclusief: false })} className="mt-0.5 h-4 w-4 accent-[#1a1a1a]" />
                        <span className="text-sm">
                          <span className="block font-semibold text-[#1a1a1a]">Exclusief btw</span>
                          <span className="block text-[#616161]">Voor zakelijke klanten. De btw komt er bij het afrekenen bij; je prijzen tonen &quot;excl. btw&quot;.</span>
                        </span>
                      </label>
                    </div>
                  </fieldset>
                  <Veld id="btw-standaard" label="Standaardtarief" uitleg="Geldt voor elk product zonder eigen tarief. Een ander tarief kies je bij het product zelf (bijvoorbeeld 9% voor eten en boeken).">
                    <select
                      {...veldProps("btw-standaard", undefined)}
                      className={`${input} sm:max-w-xs`}
                      value={s.standaard}
                      onChange={(e) => zet({ standaard: BTW_TARIEVEN.find((t) => String(t) === e.target.value) ?? 21 })}
                    >
                      <option value={21}>21% (hoog tarief)</option>
                      <option value={9}>9% (laag tarief)</option>
                      <option value={0}>0%</option>
                    </select>
                  </Veld>
                  <div className="rounded-xl bg-[#f7f7f7] px-4 py-3 text-sm text-[#303030]">
                    {perTarief.length > 0 && (
                      <p>
                        {perTarief.map((x) => `${x.n} ${x.n === 1 ? "product" : "producten"} op ${x.t}%`).join(", ")}.{" "}
                        <Link href="/studio/webshop/producten" className="font-semibold text-[#005bd3] hover:underline">
                          Tarief per product wijzigen
                        </Link>
                      </p>
                    )}
                    <p className={perTarief.length ? "mt-1 text-[#616161]" : "text-[#616161]"}>
                      Zo rekent de webshop: een product van {euro(voorbeeld)} {s.inclusief ? "inclusief" : "exclusief"} btw op {s.standaard}% {s.inclusief ? "bevat" : "krijgt erbij"} {euro(btwIn(voorbeeld, s.standaard, s.inclusief))} btw.
                    </p>
                  </div>
                </>
              )}
            </div>
          )}
          {!s.btwAan && <p className="mt-3 text-sm text-[#616161]">Nu staat er geen btw bij bestellingen. Zet het aan als je btw rekent, dan verzint de webshop nergens een tarief.</p>}
        </Card>
      </div>

      {gewijzigd && (
        <div className="mt-4 flex justify-end">
          <button type="button" onClick={() => void opslaan()} disabled={bezig} className={btn.primary}>
            {bezig ? "Opslaan…" : "Opslaan"}
          </button>
        </div>
      )}
    </>
  );
}
