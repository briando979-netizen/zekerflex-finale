"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BeheerWeergave } from "@/lib/rijschool/weergave";
import type { AppWeergave } from "@/lib/rijschool/app/weergave";
import { foutVan, stuur } from "@/components/rijschool/api";
import { Melding, Veld } from "@/components/rijschool/ui";
import { Kopieer, Stap, Waarde } from "@/components/rijschool/beheer/app/delen";
import { AppSporen } from "@/components/rijschool/beheer/app/AppSporen";

// Het tabblad App: de leerling- en instructeur-app werken al in de browser; hier
// komt daarnaast de eigen Android-app van de rijschool in haar eigen Google
// Play-account. Links de stappen (zoals "App instellen" in Play Console), rechts
// de sporen (interne test, gesloten test, productie) en wat er gebeurde.

const URL = "/api/rijschool/beheer/app";

type Antwoord = AppWeergave & { verstuurd?: number; aantal?: number; handmatigVersturen?: boolean; beoordelaar?: { email: string; wachtwoord: string } };

export function AppTab({ data }: { data: BeheerWeergave }) {
  const r = data.rijschool;
  const [w, setW] = useState<AppWeergave | null>(null);
  const [bezig, setBezig] = useState<string | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [beoordelaar, setBeoordelaar] = useState<{ email: string; wachtwoord: string } | null>(null);
  const [form, setForm] = useState({ appNaam: "", pakketnaam: "", korteTekst: "", langeTekst: "" });
  const geladen = useRef(false);

  const laad = useCallback(async () => {
    try {
      const d = await stuur<AppWeergave>(URL);
      setW(d);
      if (!geladen.current) {
        geladen.current = true;
        const a = d.app;
        setForm(a ? { appNaam: a.appNaam, pakketnaam: a.pakketnaam, korteTekst: a.korteTekst, langeTekst: a.langeTekst } : d.voorstel);
      }
    } catch (e) {
      setFout(foutVan(e));
    }
  }, []);

  useEffect(() => {
    void laad();
  }, [laad]);

  // tijdens een bouw elke 5 seconden de stand
  const fase = w?.app?.taak.fase ?? "";
  useEffect(() => {
    if (fase !== "bouwt" && fase !== "verwerkt") return;
    const t = setInterval(() => void laad(), 5000);
    return () => clearInterval(t);
  }, [fase, laad]);

  async function actie(naam: string, body: Record<string, unknown>, gelukt: (d: Antwoord) => string | null) {
    setBezig(naam);
    setFout(null);
    setOk(null);
    try {
      const d = await stuur<Antwoord>(URL, "POST", body);
      setW(d);
      if (d.beoordelaar) setBeoordelaar(d.beoordelaar);
      setOk(gelukt(d));
    } catch (e) {
      setFout(foutVan(e));
      void laad();
    } finally {
      setBezig(null);
    }
  }

  if (!w) {
    return (
      <div className="card p-5">
        <Melding fout={fout} />
        {!fout && <p className="text-sm text-neutralx-600">Laden…</p>}
      </div>
    );
  }

  const a = w.app;
  const loopt = fase === "bouwt" || fase === "verwerkt";
  const live = !!a?.liveSinds;

  return (
    <div className="space-y-5">
      {/* kop: de app zoals hij in de winkel staat */}
      <section className="card flex flex-wrap items-center gap-4 p-5">
        {/* eslint-disable-next-line @next/next/no-img-element -- eigen PNG-route, geen optimalisatie nodig */}
        <img src={w.links.icoon} alt="" width={64} height={64} className="h-16 w-16 rounded-2xl shadow-sm ring-1 ring-hair" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-display text-lg font-bold text-ink">{a?.appNaam || form.appNaam || r.naam}</h2>
          <p className="truncate text-sm text-neutralx-600">{a ? a.pakketnaam : "Je eigen app in Google Play"}</p>
          <p className="mt-1">
            {live ? (
              <span className="pill-ok">Live in Google Play</span>
            ) : a?.gekoppeld ? (
              <span className="pill-warn">In test</span>
            ) : a?.versie ? (
              <span className="pill-warn">Gebouwd: wacht op de eerste upload</span>
            ) : (
              <span className="pill-neutral">Nog niet in Google Play</span>
            )}
          </p>
        </div>
        {live && a && (
          <div className="flex flex-wrap gap-2">
            <a href={a.winkelLink} target="_blank" rel="noopener" className="btn-primary">
              Bekijk in Google Play
            </a>
            <Kopieer tekst={a.winkelLink} label="Kopieer winkellink" />
          </div>
        )}
      </section>

      <Melding fout={fout} ok={ok} />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-3">
          <Stap nr={1} titel="Gegevens van je app" klaar={!!a} open={!a}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Veld label="Naam in Google Play" uitleg="Hooguit 30 tekens.">
                <input className="field-input" maxLength={30} value={form.appNaam} onChange={(e) => setForm({ ...form, appNaam: e.target.value })} />
              </Veld>
              <Veld label="Pakketnaam" uitleg={a?.pakketVast ? "Ligt vast: zo kent Google Play je app." : "Uniek in Google Play; ligt vast na de eerste upload."}>
                <input
                  className="field-input font-mono text-xs"
                  value={form.pakketnaam}
                  disabled={a?.pakketVast}
                  onChange={(e) => setForm({ ...form, pakketnaam: e.target.value.toLowerCase().replace(/\s/g, "") })}
                />
              </Veld>
              <div className="sm:col-span-2">
                <Veld label="Korte omschrijving" uitleg={`${form.korteTekst.length}/80 tekens. Staat onder de naam in de winkel.`}>
                  <input className="field-input" maxLength={80} value={form.korteTekst} onChange={(e) => setForm({ ...form, korteTekst: e.target.value })} />
                </Veld>
              </div>
              <div className="sm:col-span-2">
                <Veld label="Volledige omschrijving" uitleg={`${form.langeTekst.length}/4000 tekens.`}>
                  <textarea className="field-input" rows={8} maxLength={4000} value={form.langeTekst} onChange={(e) => setForm({ ...form, langeTekst: e.target.value })} />
                </Veld>
              </div>
            </div>
            <button type="button" className="btn-primary" disabled={!!bezig} onClick={() => void actie("instellen", { actie: "instellen", ...form }, () => "Opgeslagen.")}>
              {bezig === "instellen" ? "Opslaan…" : "Opslaan"}
            </button>
          </Stap>

          <Stap nr={2} titel="App laten bouwen" klaar={!!a?.versie} open={!!a && !a.versie}>
            <p>ZekerFlex maakt je Android-app met je naam, je kleuren en dit icoon. De app opent de leerling- en instructeur-app schermvullend, zonder adresbalk.</p>
            {!w.bouwerIngesteld && <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900">Het bouwen van apps staat nog niet aan op de server. ZekerFlex zet dit aan; probeer het later opnieuw.</p>}
            {a?.taak.fase === "fout" && a.taak.fout && <p className="rounded-lg bg-red-50 px-3 py-2 text-crit">{a.taak.fout}</p>}
            {loopt && a && (
              <div className="rounded-lg bg-paper-soft p-3">
                <p className="font-medium text-ink">
                  Versie {a.taak.versie} wordt gebouwd{a.taak.plaatsInRij > 1 ? ` (nummer ${a.taak.plaatsInRij} in de rij)` : ""}…
                </p>
                <p className="text-xs text-neutralx-500">Dit duurt een paar minuten. Je kunt deze pagina gerust sluiten.</p>
                {a.taak.voortgang.length > 0 && (
                  <ul className="mt-2 space-y-0.5 text-xs text-neutralx-600">
                    {a.taak.voortgang.map((v, i) => (
                      <li key={`${i}-${v}`}>{v}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={a?.versie ? "btn-ghost" : "btn-primary"}
                disabled={!a || loopt || !!bezig || !w.bouwerIngesteld}
                onClick={() => void actie("bouw", { actie: "bouw", naarInterneTest: false }, () => "De bouw is gestart.")}
              >
                {a?.versie ? "Opnieuw bouwen" : "Bouw mijn app"}
              </button>
              {a?.aabBeschikbaar && !loopt && (
                <a href={`${URL}/aab`} className="btn-primary" download>
                  Download app-bestand (.aab, versie {a.versie})
                </a>
              )}
            </div>
          </Stap>

          <Stap nr={3} titel="Eerste versie in Google Play zetten (eenmalig)" klaar={!!a?.gekoppeld} open={!!a?.versie && !a.gekoppeld}>
            <p>Google laat de allereerste versie van een nieuwe app alleen met de hand uploaden. Daarna doet ZekerFlex het voor je.</p>
            <ol className="list-decimal space-y-2 pl-5">
              <li>
                Maak een ontwikkelaarsaccount op{" "}
                <a href="https://play.google.com/console/signup" target="_blank" rel="noopener" className="underline">
                  play.google.com/console
                </a>{" "}
                (eenmalig 25 dollar). <strong>Tip:</strong> kies <em>Organisatie</em> met je KVK-gegevens en een D-U-N-S-nummer (gratis aan te vragen). Dan hoef je niet eerst 14
                dagen met 12 testers te testen voordat je live mag.
              </li>
              <li>
                Kies <em>App maken</em>. Naam: <strong>{a?.appNaam || form.appNaam}</strong>, standaardtaal <strong>Nederlands – nl-NL</strong>, <em>App</em>, <em>Gratis</em>.
              </li>
              <li>
                Ga naar <em>Testen → Interne tests → Nieuwe release maken</em>. Laat Google de app ondertekenen (standaard), upload het app-bestand uit stap 2, sla op en kies{" "}
                <em>Uitrol starten</em>.
              </li>
            </ol>
          </Stap>

          <Stap nr={4} titel="ZekerFlex toegang geven" klaar={!!a?.gekoppeld} open={!!a?.versie && !a.gekoppeld}>
            {w.serviceEmail ? (
              <>
                <ol className="list-decimal space-y-2 pl-5">
                  <li>
                    In Play Console: <em>Gebruikers en rechten → Nieuwe gebruikers uitnodigen</em>.
                  </li>
                  <li>Vul dit e-mailadres in:</li>
                </ol>
                <Waarde label="E-mailadres" waarde={w.serviceEmail} />
                <ol start={3} className="list-decimal space-y-2 pl-5">
                  <li>
                    Kies bij <em>App-rechten</em> je app en vink aan: <em>releases beheren (test en productie)</em>, <em>winkelvermelding beheren</em> en <em>testers beheren</em>.
                    Financiële gegevens zijn niet nodig.
                  </li>
                  <li>Klik op Uitnodigen. Daarna hieronder op Controleer koppeling.</li>
                </ol>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={!a || !!bezig}
                  onClick={() => void actie("koppeling", { actie: "koppeling" }, () => "Gekoppeld met Google Play.")}
                >
                  {bezig === "koppeling" ? "Controleren…" : "Controleer koppeling"}
                </button>
              </>
            ) : (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900">ZekerFlex zet de koppeling met Google Play nog aan. Je kunt de app intussen al bouwen en uploaden.</p>
            )}
          </Stap>

          <Stap nr={5} titel="Winkelpagina" klaar={false} open={!!a?.gekoppeld && !live}>
            <p>Met één klik zet ZekerFlex je teksten uit stap 1, het icoon en een functieafbeelding in je kleuren op je winkelpagina.</p>
            <button type="button" className="btn-primary" disabled={!a?.gekoppeld || !!bezig} onClick={() => void actie("winkelpagina", { actie: "winkelpagina" }, () => "Winkelpagina bijgewerkt in Google Play.")}>
              {bezig === "winkelpagina" ? "Bezig…" : "Zet winkelpagina in Google Play"}
            </button>
            <Schermafbeeldingen uit={!a?.gekoppeld || !!bezig} bezig={bezig === "schermafbeeldingen"} onKies={(beelden) => void actie("schermafbeeldingen", { actie: "schermafbeeldingen", beelden }, (d) => `${d.aantal ?? 0} schermafbeeldingen geplaatst.`)} />
          </Stap>

          <Stap nr={6} titel="App-inhoud invullen in Play Console (eenmalig)" klaar={live} open={false}>
            <p>Google vraagt een paar verklaringen voordat de app de winkel in mag. Dit zijn de antwoorden voor jouw app:</p>
            <Waarde label="Privacybeleid" waarde={w.links.privacy} />
            <p>
              <strong>App-toegang:</strong> kies &quot;Alle of sommige functies zijn beperkt&quot; en geef de beoordelaar van Google een testaccount:
            </p>
            {beoordelaar ? (
              <div className="space-y-2 rounded-lg bg-paper-soft p-3">
                <Waarde label="E-mailadres" waarde={beoordelaar.email} />
                <Waarde label="Wachtwoord" waarde={beoordelaar.wachtwoord} />
                <p className="text-xs text-neutralx-500">Dit wachtwoord zie je maar één keer. Kies bij Inloggen voor &quot;Leerling&quot;.</p>
              </div>
            ) : (
              <button type="button" className="btn-ghost" disabled={!!bezig} onClick={() => void actie("beoordelaar", { actie: "beoordelaar" }, () => "Testaccount gemaakt.")}>
                Maak testaccount voor Google
              </button>
            )}
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <strong>Advertenties:</strong> nee.
              </li>
              <li>
                <strong>Contentclassificatie:</strong> categorie &quot;Alle andere apptypen&quot;; alle vragen nee.
              </li>
              <li>
                <strong>Doelgroep:</strong> 16–17 jaar en 18 jaar en ouder.
              </li>
              <li>
                <strong>Gegevensveiligheid:</strong> verzamelt naam, e-mailadres, telefoonnummer, adres en app-activiteit (lessen, voortgang), voor app-functionaliteit en
                accountbeheer. Niet gedeeld, versleuteld verzonden, verwijderen kan op verzoek bij de rijschool.
              </li>
              <li>
                <strong>Overheidsapp, financiële functies, gezondheid:</strong> nee.
              </li>
            </ul>
          </Stap>
        </div>

        <AppSporen w={w} bezig={bezig} actie={actie} opnieuw={() => void laad()} />
      </div>

      <section className="card space-y-3 p-5">
        <div>
          <span className="pill-ok">Werkt nu al</span>
          <h2 className="mt-2 font-display text-lg font-bold text-ink">De app in de browser en op het beginscherm</h2>
          <p className="mt-1 text-sm text-neutralx-600">
            Ook zonder Google Play openen je leerlingen en instructeurs de app in hun browser en zetten hem op hun beginscherm, met je naam en icoon. Zo werkt hij ook op een
            iPhone.
          </p>
        </div>
        {[
          { label: "Leerling-app", url: `${r.url}/leerling`, tekst: "Lessen, voortgang per onderdeel, huiswerk, tegoed en theorie oefenen." },
          { label: "Instructeur-app", url: `${r.url}/instructeur`, tekst: "Lesdag, leskaart invullen tijdens de les, volgende les plannen en betaling in de auto." },
        ].map((x) => (
          <div key={x.label} className="rounded-xl border border-hair p-4">
            <p className="font-semibold text-ink">{x.label}</p>
            <p className="text-sm text-neutralx-600">{x.tekst}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded bg-paper-soft px-2 py-1 text-xs">{x.url}</code>
              <Kopieer tekst={x.url} label="Kopieer link" />
              <a href={x.url} target="_blank" rel="noopener" className="btn-ghost !px-3 !py-1.5 text-xs">
                Openen
              </a>
            </div>
          </div>
        ))}
        <p className="text-sm text-neutralx-600">
          iPhone: open de link in Safari, tik op Delen en kies &quot;Zet op beginscherm&quot;. Android: open de link in Chrome, tik op de drie puntjes en kies
          &quot;Toevoegen aan startscherm&quot;. Een leerling krijgt de link ook in de mail waarmee hij zijn wachtwoord kiest.
        </p>
      </section>
    </div>
  );
}

function Schermafbeeldingen({ uit, bezig, onKies }: { uit: boolean; bezig: boolean; onKies: (beelden: string[]) => void }) {
  const [fout, setFout] = useState<string | null>(null);
  return (
    <div className="rounded-lg border border-dashed border-hair p-3">
      <p className="font-medium text-ink">Schermafbeeldingen (2 tot 8)</p>
      <p className="text-xs text-neutralx-500">Open de app op je telefoon, maak een paar schermafbeeldingen en kies ze hier. ZekerFlex maakt ze passend voor Google Play.</p>
      <input
        type="file"
        accept="image/png,image/jpeg"
        multiple
        disabled={uit}
        className="mt-2 block w-full text-xs"
        onChange={async (e) => {
          setFout(null);
          const bestanden = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (bestanden.length < 2 || bestanden.length > 8) return setFout("Kies 2 tot 8 schermafbeeldingen.");
          if (bestanden.some((b) => b.size > 8_000_000)) return setFout("Elke schermafbeelding mag hooguit 8 MB zijn.");
          const beelden = await Promise.all(
            bestanden.map(
              (b) =>
                new Promise<string>((klaar, mis) => {
                  const lezer = new FileReader();
                  lezer.onload = () => klaar(String(lezer.result));
                  lezer.onerror = () => mis(new Error("lezen"));
                  lezer.readAsDataURL(b);
                }),
            ),
          ).catch(() => null);
          if (!beelden) return setFout("De bestanden konden niet worden gelezen.");
          onKies(beelden);
        }}
      />
      {bezig && <p className="mt-1 text-xs text-neutralx-600">Uploaden naar Google Play…</p>}
      {fout && <p className="mt-1 text-xs text-crit">{fout}</p>}
    </div>
  );
}
