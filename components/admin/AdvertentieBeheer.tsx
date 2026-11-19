"use client";

import { useState } from "react";
import { Empty, Panel, Pill, type Tone } from "@/components/admin/kit";
import { BRANCHES, SFEREN, logoAantal, logoVrij, type Logo, type LogoNr } from "@/lib/logo/regels";
import { BTW_TEKST, KEUZE_GEWIJZIGD, KLEUREN, ONTWERPEN, PAKKET_NAAM, PRIJS_MAX, ontwerpVrij, prijsTekst, type Advertentie, type Prijzen, type Status } from "@/lib/advertentie/regels";

// Beheer van advertenties op maat en logo's: de lijst met de invoer, de keuze en de contactgegevens, een kleine schone
// voorvertoning (de beeldroute geeft die alleen aan een platformbeheerder met ?beheer=1), Vrijgeven, Verwijderen en de
// prijzen. Standaard staat alleen wat is aangevraagd of vrijgegeven in de lijst; "ook alleen bekeken" toont de rest.
// Na een wijziging nemen we de versie van de server over. Vrijgeven stuurt het tijdstip van de aanvraag mee die hier op
// het scherm staat: koos de klant intussen iets anders, dan weigert de server (409) en tonen we de nieuwe aanvraag.

const STATUS: Record<Status, { label: string; tone: Tone }> = {
  gemaakt: { label: "Alleen bekeken", tone: "neutral" },
  aangevraagd: { label: "Aangevraagd", tone: "warn" },
  vrijgegeven: { label: "Vrijgegeven", tone: "ok" },
};

const tijd = (iso: string) => new Date(iso).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const ontwerpNaam = (nr: number) => ONTWERPEN.find((o) => o.nr === nr)?.naam ?? String(nr);
const mute = { color: "var(--a-mute)" };
const rand = { borderColor: "var(--a-border)" };

type Soort = "advertentie" | "logo";

export function AdvertentieBeheer({ begin, beginLogos, beginPrijzen, beginIngesteld, standaard }: { begin: Advertentie[]; beginLogos: Logo[]; beginPrijzen: Prijzen; beginIngesteld: { een: string; alle: string; logo: string }; standaard: Prijzen }) {
  const [lijst, setLijst] = useState(begin);
  const [logos, setLogos] = useState(beginLogos);
  const [prijzen, setPrijzen] = useState(beginPrijzen);
  const [een, setEen] = useState(beginIngesteld.een);
  const [alle, setAlle] = useState(beginIngesteld.alle);
  const [logoPrijs, setLogoPrijs] = useState(beginIngesteld.logo);
  const [ookBekeken, setOokBekeken] = useState(false);
  const [bezig, setBezig] = useState<string | null>(null);
  const [melding, setMelding] = useState<{ ok: boolean; tekst: string } | null>(null);

  const zetRij = (soort: Soort, rij: Advertentie | Logo) => {
    if (soort === "logo") setLogos((l) => l.map((x) => (x.id === rij.id ? (rij as Logo) : x)));
    else setLijst((l) => l.map((x) => (x.id === rij.id ? (rij as Advertentie) : x)));
  };

  async function stuur(method: "PATCH" | "DELETE", body: unknown, sleutel: string): Promise<{ status: number; data: Record<string, unknown> & { error?: { code?: string; message?: string } } } | null> {
    setBezig(sleutel);
    setMelding(null);
    try {
      const res = await fetch("/api/admin/advertentie-op-maat", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: { code?: string; message?: string } };
      return { status: res.status, data };
    } catch {
      setMelding({ ok: false, tekst: "Geen verbinding. Probeer het opnieuw." });
      return null;
    } finally {
      setBezig(null);
    }
  }
  const mislukt = (r: { status: number; data: { error?: { message?: string } } }) => {
    if (r.status < 400) return false;
    setMelding({ ok: false, tekst: r.data.error?.message ?? "Dat lukte niet. Probeer het opnieuw." });
    return true;
  };

  async function geefVrij(soort: Soort, rij: Advertentie | Logo, naam: string, keuze: string) {
    const a = rij.aanvraag;
    if (!a) return;
    if (!window.confirm(`Vrijgeven voor ${naam}?\n\nKeuze: ${keuze}\n\nDoe dit pas na betaling van dit bedrag. De klant krijgt een mail met de link naar de schone bestanden.`)) return;
    const r = await stuur("PATCH", { actie: "vrijgeven", soort, id: rij.id, gezienOp: a.op }, rij.id);
    if (!r) return;
    const nieuw = r.data.rij as Advertentie | Logo | undefined;
    // ook bij een weigering de versie van de server overnemen: daar staat de nieuwe keuze van de klant in
    if (nieuw) zetRij(soort, nieuw);
    if (r.status === 409 && r.data.error?.code === KEUZE_GEWIJZIGD.code) return setMelding({ ok: false, tekst: KEUZE_GEWIJZIGD.tekst });
    if (mislukt(r) || !nieuw) return;
    setMelding(r.data.gemaild ? { ok: true, tekst: "Vrijgegeven. De klant heeft de mail met de link gekregen." } : { ok: false, tekst: "Vrijgegeven, maar de mail is niet verstuurd. Stuur de klant zelf de link naar zijn pagina." });
  }

  async function verwijder(soort: Soort, id: string, naam: string) {
    if (!window.confirm(`Alles van ${naam} definitief verwijderen?`)) return;
    const r = await stuur("DELETE", { soort, id }, id);
    if (!r || mislukt(r)) return;
    if (soort === "logo") setLogos((l) => l.filter((x) => x.id !== id));
    else setLijst((l) => l.filter((x) => x.id !== id));
    setMelding({ ok: true, tekst: "Verwijderd." });
  }

  async function bewaarPrijs(e: React.FormEvent) {
    e.preventDefault();
    const r = await stuur("PATCH", { actie: "prijs", een, alle, logo: logoPrijs }, "prijs");
    if (!r || mislukt(r)) return;
    const nieuw = r.data.prijzen as Prijzen | undefined;
    const ingesteld = r.data.ingesteld as { een: string; alle: string; logo: string } | undefined;
    if (!nieuw || !ingesteld) return;
    setPrijzen(nieuw);
    setEen(ingesteld.een);
    setAlle(ingesteld.alle);
    setLogoPrijs(ingesteld.logo);
    setMelding({ ok: true, tekst: "De prijzen zijn bewaard." });
  }

  const toon = <T extends { status: Status }>(rijen: T[]) => (ookBekeken ? rijen : rijen.filter((r) => r.status !== "gemaakt"));
  const advertenties = toon(lijst);
  const logoRijen = toon(logos);
  const verborgen = lijst.length + logos.length - advertenties.length - logoRijen.length;
  const prijsVelden = [
    { id: "adv-prijs-een", label: "Eén ontwerp", waarde: een, zet: setEen, standaard: standaard.een },
    { id: "adv-prijs-alle", label: "Alle ontwerpen", waarde: alle, zet: setAlle, standaard: standaard.alle },
    { id: "adv-prijs-logo", label: "Eén logo", waarde: logoPrijs, zet: setLogoPrijs, standaard: standaard.logo },
  ];

  return (
    <div className="space-y-5">
      {melding && (
        <p role={melding.ok ? "status" : "alert"} className="text-sm" style={{ color: melding.ok ? "var(--a-ok-ink)" : "var(--a-crit)" }}>
          {melding.tekst}
        </p>
      )}

      <Panel title="Prijs" subtitle={`Alleen een bedrag (${BTW_TEKST}), bijvoorbeeld 29 of 29,50. Leeg laten = de standaard.`}>
        <form onSubmit={bewaarPrijs} className="flex flex-wrap items-end gap-3">
          {prijsVelden.map((v) => (
            <div key={v.id}>
              <label htmlFor={v.id} className="block text-xs font-medium" style={mute}>
                {v.label} (standaard {v.standaard})
              </label>
              <input id={v.id} className="a-input mt-1 w-40" inputMode="decimal" value={v.waarde} onChange={(e) => v.zet(e.target.value)} maxLength={PRIJS_MAX} placeholder={v.standaard} />
            </div>
          ))}
          <button type="submit" disabled={bezig !== null} className="a-btn a-btn-primary disabled:opacity-50">
            Bewaren
          </button>
          <p className="w-full text-xs" style={mute}>
            Nu geldt: {prijsTekst(prijzen, "een")} voor één ontwerp, {prijsTekst(prijzen, "alle")} voor alle ontwerpen, {prijsTekst(prijzen, "logo")} voor een logo. Dat staat zo op /advertentie-op-maat, /logo-maker en /starters, op de pagina van de klant
            en in de mails. De kaarten op /aanbod en in het menu tonen altijd de standaardprijs; die volgen dit veld niet.
          </p>
        </form>
      </Panel>

      <label className="flex w-fit cursor-pointer items-center gap-2 text-sm" style={{ color: "var(--a-text)" }}>
        <input type="checkbox" checked={ookBekeken} onChange={(e) => setOokBekeken(e.target.checked)} className="h-4 w-4" />
        Ook alleen bekeken tonen{!ookBekeken && verborgen > 0 ? ` (${verborgen} verborgen)` : ""}
      </label>

      <Panel title="Advertenties" subtitle="Nieuwste eerst. De beelden hier zijn zonder watermerk; alleen jij ziet ze zo.">
        {advertenties.length === 0 ? (
          <Empty title="Niets om te tonen" body="Zodra iemand op /advertentie-op-maat een advertentie wil hebben, staat hij hier." />
        ) : (
          <ul className="space-y-4">
            {advertenties.map((ad) => {
              const s = STATUS[ad.status];
              const a = ad.aanvraag;
              const nr = a ? a.ontwerp : 1;
              const keuze = a ? `${PAKKET_NAAM[a.pakket]} voor ${prijsTekst(prijzen, a.pakket)}, aangeklikt: ontwerp ${a.ontwerp} (${ontwerpNaam(a.ontwerp)})` : "";
              const beeld = (o: number, klein: boolean) => `/api/advertentie/${ad.id}/beeld?ontwerp=${o}&formaat=vierkant&beheer=1${klein ? "&klein=1" : ""}`;
              return (
                <li key={ad.id} className="relative flex flex-col gap-4 rounded-xl border p-4 md:flex-row" style={rand}>
                  <a href={beeld(nr, false)} target="_blank" rel="noopener" className="block flex-shrink-0 self-start">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={beeld(nr, true)} alt={`Ontwerp ${nr} van ${ad.invoer.bedrijf}, zonder watermerk`} width={176} height={176} loading="lazy" className="h-44 w-44 rounded-lg" />
                  </a>
                  <div className="min-w-0 flex-1 text-sm" style={{ color: "var(--a-text)" }}>
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="break-words">{ad.invoer.bedrijf}</strong>
                      <Pill tone={s.tone}>{s.label}</Pill>
                      <span className="text-xs" style={mute}>
                        {tijd(ad.aangemaakt)} · tekst van {ad.bron === "model" ? "het taalmodel" : "het sjabloon"}
                      </span>
                    </div>
                    <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-[7.5rem_1fr]">
                      <dt style={mute}>Aanbod</dt>
                      <dd className="break-words">{ad.invoer.aanbod}</dd>
                      {ad.invoer.boodschap ? (
                        <>
                          <dt style={mute}>Boodschap</dt>
                          <dd className="break-words">{ad.invoer.boodschap}</dd>
                        </>
                      ) : null}
                      <dt style={mute}>Plaats, contact</dt>
                      <dd className="break-words">{[ad.invoer.plaats, ad.invoer.contact].filter(Boolean).join(" · ") || "niet ingevuld"}</dd>
                      <dt style={mute}>Kleur</dt>
                      <dd>{KLEUREN.find((k) => k.id === ad.invoer.kleur)?.naam ?? ad.invoer.kleur}</dd>
                      <dt style={mute}>Tekst</dt>
                      <dd className="break-words">
                        {ad.tekst.kop} · {ad.tekst.onderregel} · {ad.tekst.knop}
                      </dd>
                      <dt style={mute}>Keuze</dt>
                      <dd className="break-words">{a ? keuze : "nog niet aangevraagd"}</dd>
                      {a ? (
                        <>
                          <dt style={mute}>Klant</dt>
                          <dd className="break-words">
                            {a.naam} ·{" "}
                            <a href={`mailto:${a.email}`} className="underline underline-offset-2">
                              {a.email}
                            </a>
                            {a.telefoon ? ` · ${a.telefoon}` : ""} · {tijd(a.op)}
                          </dd>
                        </>
                      ) : null}
                    </dl>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {ad.status === "aangevraagd" && (
                        <button type="button" onClick={() => void geefVrij("advertentie", ad, ad.invoer.bedrijf, keuze)} disabled={bezig !== null} className="a-btn a-btn-primary disabled:opacity-50">
                          Vrijgeven (na betaling)
                        </button>
                      )}
                      <a href={`/advertentie-op-maat/${ad.id}`} target="_blank" rel="noopener" className="a-btn a-btn-ghost">
                        Pagina van de klant
                      </a>
                      {ONTWERPEN.map((o) => (
                        <a key={o.nr} href={beeld(o.nr, false)} target="_blank" rel="noopener" className="text-xs underline underline-offset-2" style={mute}>
                          Ontwerp {o.nr}
                          {ontwerpVrij(ad, o.nr) ? " (vrij)" : ""}
                        </a>
                      ))}
                      <button type="button" onClick={() => void verwijder("advertentie", ad.id, ad.invoer.bedrijf)} disabled={bezig !== null} className="a-btn a-btn-ghost ml-auto disabled:opacity-50" style={{ color: "var(--a-crit)" }}>
                        Verwijderen
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel title="Logo's" subtitle="Van de logo maker (/logo-maker). Nieuwste eerst. De beelden hier zijn zonder watermerk; alleen jij ziet ze zo.">
        {logoRijen.length === 0 ? (
          <Empty title="Niets om te tonen" body="Zodra iemand op /logo-maker een logo wil hebben, staat het hier." />
        ) : (
          <ul className="space-y-4">
            {logoRijen.map((logo) => {
              const s = STATUS[logo.status];
              const a = logo.aanvraag;
              const nr = a ? a.logo : 3;
              const keuze = a ? `logo ${a.logo} voor ${prijsTekst(prijzen, "logo")}` : "";
              const beeld = (l: number, klein: boolean) => `/api/logo-maker/${logo.id}/beeld?logo=${l}&variant=kleur-wit&beheer=1${klein ? "&klein=1" : ""}`;
              return (
                <li key={logo.id} className="relative flex flex-col gap-4 rounded-xl border p-4 md:flex-row" style={rand}>
                  <a href={beeld(nr, false)} target="_blank" rel="noopener" className="block flex-shrink-0 self-start">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={beeld(nr, true)} alt={`Logo ${nr} van ${logo.invoer.naam}, zonder watermerk`} width={224} height={168} loading="lazy" className="h-[10.5rem] w-56 rounded-lg border" style={rand} />
                  </a>
                  <div className="min-w-0 flex-1 text-sm" style={{ color: "var(--a-text)" }}>
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="break-words">{logo.invoer.naam}</strong>
                      <Pill tone={s.tone}>{s.label}</Pill>
                      <span className="text-xs" style={mute}>
                        {tijd(logo.aangemaakt)}
                      </span>
                    </div>
                    <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-[7.5rem_1fr]">
                      {logo.invoer.slogan ? (
                        <>
                          <dt style={mute}>Slogan</dt>
                          <dd className="break-words">{logo.invoer.slogan}</dd>
                        </>
                      ) : null}
                      <dt style={mute}>Soort bedrijf</dt>
                      <dd className="break-words">{[BRANCHES.find((b) => b.id === logo.invoer.branche)?.naam, logo.invoer.brancheTekst].filter(Boolean).join(": ")}</dd>
                      <dt style={mute}>Kleur, sfeer</dt>
                      <dd>
                        {KLEUREN.find((k) => k.id === logo.invoer.kleur)?.naam ?? logo.invoer.kleur} · {SFEREN.find((x) => x.id === logo.invoer.sfeer)?.naam ?? logo.invoer.sfeer}
                      </dd>
                      <dt style={mute}>Keuze</dt>
                      <dd className="break-words">{a ? keuze : "nog niet aangevraagd"}</dd>
                      {a ? (
                        <>
                          <dt style={mute}>Klant</dt>
                          <dd className="break-words">
                            {a.naam} ·{" "}
                            <a href={`mailto:${a.email}`} className="underline underline-offset-2">
                              {a.email}
                            </a>
                            {a.telefoon ? ` · ${a.telefoon}` : ""} · {tijd(a.op)}
                          </dd>
                        </>
                      ) : null}
                    </dl>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {logo.status === "aangevraagd" && (
                        <button type="button" onClick={() => void geefVrij("logo", logo, logo.invoer.naam, keuze)} disabled={bezig !== null} className="a-btn a-btn-primary disabled:opacity-50">
                          Vrijgeven (na betaling)
                        </button>
                      )}
                      <a href={`/logo-maker/${logo.id}`} target="_blank" rel="noopener" className="a-btn a-btn-ghost">
                        Pagina van de klant
                      </a>
                      {Array.from({ length: logoAantal(logo) }, (_, n) => (n + 1) as LogoNr).map((l) => (
                        <a key={l} href={beeld(l, false)} target="_blank" rel="noopener" className="text-xs underline underline-offset-2" style={mute}>
                          Logo {l}
                          {logoVrij(logo, l) ? " (vrij)" : ""}
                        </a>
                      ))}
                      <button type="button" onClick={() => void verwijder("logo", logo.id, logo.invoer.naam)} disabled={bezig !== null} className="a-btn a-btn-ghost ml-auto disabled:opacity-50" style={{ color: "var(--a-crit)" }}>
                        Verwijderen
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
