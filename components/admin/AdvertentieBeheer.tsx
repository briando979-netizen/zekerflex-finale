"use client";

import { useState } from "react";
import { Empty, Panel, Pill, type Tone } from "@/components/admin/kit";
import { LOGOS, SFEREN, BRANCHES, logoVrij, type Logo } from "@/lib/logo/regels";
import { BTW_TEKST, KLEUREN, ONTWERPEN, PAKKET_NAAM, PRIJS_MAX, ontwerpVrij, prijsTekst, type Advertentie, type Prijzen, type Status } from "@/lib/advertentie/regels";

// Beheer van advertenties op maat: de lijst met de invoer, de keuze en de contactgegevens, de schone voorvertoning
// (de beeldroute geeft die alleen aan een platformbeheerder met ?beheer=1), Vrijgeven, Verwijderen en de prijzen.
// Na een wijziging nemen we de versie van de server over.

const STATUS: Record<Status, { label: string; tone: Tone }> = {
  gemaakt: { label: "Gemaakt", tone: "neutral" },
  aangevraagd: { label: "Aangevraagd", tone: "warn" },
  vrijgegeven: { label: "Vrijgegeven", tone: "ok" },
};

const tijd = (iso: string) => new Date(iso).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const ontwerpNaam = (nr: number) => ONTWERPEN.find((o) => o.nr === nr)?.naam ?? String(nr);
const mute = { color: "var(--a-mute)" };

const logoNaam = (nr: number) => LOGOS.find((l) => l.nr === nr)?.naam ?? String(nr);

export function AdvertentieBeheer({ begin, beginLogos, beginPrijzen, beginIngesteld, standaard }: { begin: Advertentie[]; beginLogos: Logo[]; beginPrijzen: Prijzen; beginIngesteld: { een: string; alle: string; logo: string }; standaard: Prijzen }) {
  const [lijst, setLijst] = useState(begin);
  const [logos, setLogos] = useState(beginLogos);
  const [logoPrijs, setLogoPrijs] = useState(beginIngesteld.logo);
  const [prijzen, setPrijzen] = useState(beginPrijzen);
  const [een, setEen] = useState(beginIngesteld.een);
  const [alle, setAlle] = useState(beginIngesteld.alle);
  const [bezig, setBezig] = useState<string | null>(null);
  const [melding, setMelding] = useState<{ ok: boolean; tekst: string } | null>(null);

  async function stuur(method: "PATCH" | "DELETE", body: unknown, sleutel: string): Promise<Record<string, unknown> | null> {
    setBezig(sleutel);
    setMelding(null);
    try {
      const res = await fetch("/api/admin/advertentie-op-maat", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: { message?: string } };
      if (!res.ok) {
        setMelding({ ok: false, tekst: data.error?.message ?? "Dat lukte niet. Probeer het opnieuw." });
        return null;
      }
      return data;
    } catch {
      setMelding({ ok: false, tekst: "Geen verbinding. Probeer het opnieuw." });
      return null;
    } finally {
      setBezig(null);
    }
  }

  async function geefVrij(ad: Advertentie) {
    if (!window.confirm(`Vrijgeven voor ${ad.invoer.bedrijf}? Doe dit pas na betaling. De klant krijgt een mail met de link naar de schone bestanden.`)) return;
    const data = await stuur("PATCH", { actie: "vrijgeven", id: ad.id }, ad.id);
    const nieuw = data?.advertentie as Advertentie | undefined;
    if (!nieuw) return;
    setLijst((l) => l.map((x) => (x.id === nieuw.id ? nieuw : x)));
    setMelding(data?.gemaild ? { ok: true, tekst: "Vrijgegeven. De klant heeft de mail met de link gekregen." } : { ok: false, tekst: "Vrijgegeven, maar de mail is niet verstuurd. Stuur de klant zelf de link naar zijn pagina." });
  }

  async function verwijder(ad: Advertentie) {
    if (!window.confirm(`De advertentie van ${ad.invoer.bedrijf} definitief verwijderen?`)) return;
    const data = await stuur("DELETE", { id: ad.id }, ad.id);
    if (!data) return;
    setLijst((l) => l.filter((x) => x.id !== ad.id));
    setMelding({ ok: true, tekst: "Verwijderd." });
  }

  async function geefLogoVrij(logo: Logo) {
    if (!window.confirm(`Het logo van ${logo.invoer.naam} vrijgeven? Doe dit pas na betaling. De klant krijgt een mail met de link naar de schone bestanden.`)) return;
    const data = await stuur("PATCH", { actie: "vrijgeven", soort: "logo", id: logo.id }, logo.id);
    const nieuw = data?.logo as Logo | undefined;
    if (!nieuw) return;
    setLogos((l) => l.map((x) => (x.id === nieuw.id ? nieuw : x)));
    setMelding(data?.gemaild ? { ok: true, tekst: "Vrijgegeven. De klant heeft de mail met de link gekregen." } : { ok: false, tekst: "Vrijgegeven, maar de mail is niet verstuurd. Stuur de klant zelf de link naar zijn pagina." });
  }

  async function verwijderLogo(logo: Logo) {
    if (!window.confirm(`De logo's van ${logo.invoer.naam} definitief verwijderen?`)) return;
    const data = await stuur("DELETE", { soort: "logo", id: logo.id }, logo.id);
    if (!data) return;
    setLogos((l) => l.filter((x) => x.id !== logo.id));
    setMelding({ ok: true, tekst: "Verwijderd." });
  }

  async function bewaarPrijs(e: React.FormEvent) {
    e.preventDefault();
    const data = await stuur("PATCH", { actie: "prijs", een, alle, logo: logoPrijs }, "prijs");
    const nieuw = data?.prijzen as Prijzen | undefined;
    const ingesteld = data?.ingesteld as { een: string; alle: string; logo: string } | undefined;
    if (!nieuw || !ingesteld) return;
    setPrijzen(nieuw);
    setEen(ingesteld.een);
    setAlle(ingesteld.alle);
    setLogoPrijs(ingesteld.logo);
    setMelding({ ok: true, tekst: "De prijzen zijn bewaard en staan zo op de site." });
  }

  return (
    <div className="space-y-5">
      {melding && (
        <p role={melding.ok ? "status" : "alert"} className="text-sm" style={{ color: melding.ok ? "var(--a-ok-ink)" : "var(--a-crit)" }}>
          {melding.tekst}
        </p>
      )}

      <Panel title="Prijs" subtitle={`Wat op de site, in de mail en hier staat (${BTW_TEKST}). Leeg laten = de standaard.`}>
        <form onSubmit={bewaarPrijs} className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="adv-prijs-een" className="block text-xs font-medium" style={mute}>
              Eén ontwerp (standaard {standaard.een})
            </label>
            <input id="adv-prijs-een" className="a-input mt-1 w-40" value={een} onChange={(e) => setEen(e.target.value)} maxLength={PRIJS_MAX} placeholder={standaard.een} />
          </div>
          <div>
            <label htmlFor="adv-prijs-alle" className="block text-xs font-medium" style={mute}>
              Alle drie (standaard {standaard.alle})
            </label>
            <input id="adv-prijs-alle" className="a-input mt-1 w-40" value={alle} onChange={(e) => setAlle(e.target.value)} maxLength={PRIJS_MAX} placeholder={standaard.alle} />
          </div>
          <div>
            <label htmlFor="adv-prijs-logo" className="block text-xs font-medium" style={mute}>
              Eén logo (standaard {standaard.logo})
            </label>
            <input id="adv-prijs-logo" className="a-input mt-1 w-40" value={logoPrijs} onChange={(e) => setLogoPrijs(e.target.value)} maxLength={PRIJS_MAX} placeholder={standaard.logo} />
          </div>
          <button type="submit" disabled={bezig !== null} className="a-btn a-btn-primary disabled:opacity-50">
            Bewaren
          </button>
          <p className="w-full text-xs" style={mute}>
            Nu op de site: {prijsTekst(prijzen, "een")} voor één ontwerp, {prijsTekst(prijzen, "alle")} voor alle drie, {prijsTekst(prijzen, "logo")} voor een logo.
          </p>
        </form>
      </Panel>

      <Panel title="Advertenties" subtitle="Nieuwste eerst. De beelden hier zijn zonder watermerk; alleen jij ziet ze zo.">
        {lijst.length === 0 ? (
          <Empty title="Nog geen advertenties" body="Zodra iemand op /advertentie-op-maat een advertentie laat maken, staat hij hier." />
        ) : (
          <ul className="space-y-4">
            {lijst.map((ad) => {
              const s = STATUS[ad.status];
              const a = ad.aanvraag;
              const toon = a ? a.ontwerp : 1;
              return (
                <li key={ad.id} className="relative flex flex-col gap-4 rounded-xl border p-4 md:flex-row" style={{ borderColor: "var(--a-border)" }}>
                  <a href={`/api/advertentie/${ad.id}/beeld?ontwerp=${toon}&formaat=vierkant&beheer=1`} target="_blank" rel="noopener" className="block flex-shrink-0 self-start">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/advertentie/${ad.id}/beeld?ontwerp=${toon}&formaat=vierkant&beheer=1`} alt={`Ontwerp ${toon} van ${ad.invoer.bedrijf}, zonder watermerk`} width={176} height={176} loading="lazy" className="h-44 w-44 rounded-lg" />
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
                      <dd className="break-words">{a ? `${PAKKET_NAAM[a.pakket]} (${prijsTekst(prijzen, a.pakket)}), aangeklikt: ontwerp ${a.ontwerp} (${ontwerpNaam(a.ontwerp)})` : "nog niet aangevraagd"}</dd>
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
                        <button type="button" onClick={() => void geefVrij(ad)} disabled={bezig !== null} className="a-btn a-btn-primary disabled:opacity-50">
                          Vrijgeven (na betaling)
                        </button>
                      )}
                      <a href={`/advertentie-op-maat/${ad.id}`} target="_blank" rel="noopener" className="a-btn a-btn-ghost">
                        Pagina van de klant
                      </a>
                      {ONTWERPEN.map((o) => (
                        <a key={o.nr} href={`/api/advertentie/${ad.id}/beeld?ontwerp=${o.nr}&formaat=vierkant&beheer=1`} target="_blank" rel="noopener" className="text-xs underline underline-offset-2" style={mute}>
                          Ontwerp {o.nr}
                          {ontwerpVrij(ad, o.nr) ? " (vrij)" : ""}
                        </a>
                      ))}
                      <button type="button" onClick={() => void verwijder(ad)} disabled={bezig !== null} className="a-btn a-btn-ghost ml-auto disabled:opacity-50" style={{ color: "var(--a-crit)" }}>
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
        {logos.length === 0 ? (
          <Empty title="Nog geen logo's" body="Zodra iemand op /logo-maker logo's laat maken, staat hij hier." />
        ) : (
          <ul className="space-y-4">
            {logos.map((logo) => {
              const s = STATUS[logo.status];
              const a = logo.aanvraag;
              const toon = a ? a.logo : 3;
              const src = `/api/logo-maker/${logo.id}/beeld?logo=${toon}&variant=kleur-wit&beheer=1`;
              return (
                <li key={logo.id} className="relative flex flex-col gap-4 rounded-xl border p-4 md:flex-row" style={{ borderColor: "var(--a-border)" }}>
                  <a href={src} target="_blank" rel="noopener" className="block flex-shrink-0 self-start">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={`Logo ${toon} van ${logo.invoer.naam}, zonder watermerk`} width={224} height={168} loading="lazy" className="h-[10.5rem] w-56 rounded-lg border" style={{ borderColor: "var(--a-border)" }} />
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
                      <dd className="break-words">{a ? `logo ${a.logo} (${logoNaam(a.logo)}), ${prijsTekst(prijzen, "logo")}` : "nog niet aangevraagd"}</dd>
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
                        <button type="button" onClick={() => void geefLogoVrij(logo)} disabled={bezig !== null} className="a-btn a-btn-primary disabled:opacity-50">
                          Vrijgeven (na betaling)
                        </button>
                      )}
                      <a href={`/logo-maker/${logo.id}`} target="_blank" rel="noopener" className="a-btn a-btn-ghost">
                        Pagina van de klant
                      </a>
                      {LOGOS.map((l) => (
                        <a key={l.nr} href={`/api/logo-maker/${logo.id}/beeld?logo=${l.nr}&variant=kleur-wit&beheer=1`} target="_blank" rel="noopener" className="text-xs underline underline-offset-2" style={mute}>
                          {l.nr}. {l.naam}
                          {logoVrij(logo, l.nr) ? " (vrij)" : ""}
                        </a>
                      ))}
                      <button type="button" onClick={() => void verwijderLogo(logo)} disabled={bezig !== null} className="a-btn a-btn-ghost ml-auto disabled:opacity-50" style={{ color: "var(--a-crit)" }}>
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
