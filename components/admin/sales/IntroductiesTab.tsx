"use client";

import { useCallback, useEffect, useState } from "react";
import { APanel, APill, AButton } from "@/components/admin/ui";
import { BELONING_EURO, type AdminIntroRegel, type IntroStatus } from "@/lib/introducties/regels";

// Het tabblad "Introducties" in Beheer → Sales (17 nov 2026, lib/introducties): wie welk bedrijf voorstelde, de stand, en
// de actie "Gekoppeld aan bedrijf" zodra het voorgestelde bedrijf zich aanmeldde. Koppelen geeft dat bedrijf twee weken
// geen platformkosten (vanaf vandaag) en staat in het auditspoor. Het bol-tegoed stuurt de eigenaar zelf; "Gedaan" vinkt
// de taak in Te doen af (dezelfde stand ziet de werker). Na elke actie komt de lijst opnieuw van de server.

const STAND: Record<IntroStatus, { label: string; tone: "ok" | "warn" | "crit" | "neutral" }> = {
  ingediend: { label: "Ingediend", tone: "neutral" },
  benaderd: { label: "Benaderd", tone: "neutral" },
  klant: { label: "Klant geworden", tone: "ok" },
  "beloning-onderweg": { label: "Bol-tegoed sturen", tone: "warn" },
  "beloning-verstuurd": { label: "Bol-tegoed verstuurd", tone: "ok" },
  "al-klant": { label: "Was al klant", tone: "neutral" },
  eerder: { label: "Eerder voorgesteld door een ander", tone: "neutral" },
  gestopt: { label: "Geen klant geworden", tone: "crit" },
};

const dag = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "short", year: "numeric" });

interface Bedrijf {
  id: string;
  naam: string;
  sinds: string;
}

export function IntroductiesTab() {
  const [rijen, setRijen] = useState<AdminIntroRegel[] | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [melding, setMelding] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [zoek, setZoek] = useState("");
  const [gevonden, setGevonden] = useState<Bedrijf[] | null>(null);
  const [gekozen, setGekozen] = useState<Bedrijf | null>(null);
  const [bezig, setBezig] = useState(false);

  const laad = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/sales/introducties", { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as { introducties?: AdminIntroRegel[]; error?: { message?: string } } | null;
      if (!res.ok || !data?.introducties) {
        setFout(data?.error?.message ?? "De introducties laden lukte niet. Vernieuw de pagina.");
        return;
      }
      setRijen(data.introducties);
      setFout(null);
    } catch {
      setFout("Netwerkfout bij het laden van de introducties.");
    }
  }, []);

  useEffect(() => {
    void laad();
  }, [laad]);

  function openKoppelen(r: AdminIntroRegel) {
    setOpen(open === r.id ? null : r.id);
    setZoek(r.bedrijf);
    setGevonden(null);
    setGekozen(null);
  }

  async function zoekBedrijf() {
    setFout(null);
    setGekozen(null);
    try {
      const res = await fetch(`/api/admin/sales/introducties?zoek=${encodeURIComponent(zoek.trim())}`, { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as { bedrijven?: Bedrijf[]; error?: { message?: string } } | null;
      if (!res.ok || !data?.bedrijven) {
        setFout(data?.error?.message ?? "Zoeken lukte niet.");
        return;
      }
      setGevonden(data.bedrijven);
    } catch {
      setFout("Netwerkfout bij het zoeken.");
    }
  }

  async function koppel(r: AdminIntroRegel, b: Bedrijf) {
    if (!r.leadId) return;
    setBezig(true);
    setFout(null);
    setMelding(null);
    try {
      const res = await fetch("/api/admin/sales/introducties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actie: "koppel", leadId: r.leadId, tenantId: b.id }),
      });
      const data = (await res.json().catch(() => null)) as { introducties?: AdminIntroRegel[]; error?: { message?: string } } | null;
      if (!res.ok) {
        setFout(data?.error?.message ?? "Koppelen lukte niet.");
        return;
      }
      if (data?.introducties) setRijen(data.introducties);
      setMelding(`${r.bedrijf} is gekoppeld aan ${b.naam}. De komende twee weken betaalt ${b.naam} geen platformkosten.`);
      setOpen(null);
    } catch {
      setFout("Netwerkfout: er is niets gekoppeld.");
    } finally {
      setBezig(false);
    }
  }

  async function verstuurd(r: AdminIntroRegel) {
    if (!r.beloning) return;
    setBezig(true);
    setFout(null);
    setMelding(null);
    try {
      const res = await fetch("/api/admin/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle", id: r.beloning.todoId, done: true }),
      });
      if (!res.ok) {
        setFout("Afvinken lukte niet. Probeer het in Beheer → Te doen.");
        return;
      }
      setMelding(`Bol-tegoed voor ${r.door.naam} staat op verstuurd.`);
      await laad();
    } catch {
      setFout("Netwerkfout: niets afgevinkt.");
    } finally {
      setBezig(false);
    }
  }

  return (
    <div className="space-y-4">
      <APanel
        title="Introducties"
        subtitle={`Bedrijven die werkers en werkgevers voorstelden via "Introduceer een bedrijf". ZekerFlex mailt ze nooit vanzelf: bel of mail ze zelf (ze staan ook in de lijst en, met een telefoonnummer, bij Bellen). Meldt het bedrijf zich aan, kies dan "Gekoppeld aan bedrijf": vanaf die dag twee weken geen platformkosten. Na de eerste betaalde factuur komt er een taak om € ${BELONING_EURO} bol-tegoed te sturen.`}
      >
        <p className="text-xs" style={{ color: "var(--a-mute)" }}>
          De korting geldt voor platformkosten (zzp&apos;ers en flexwerkers). Werkt een bedrijf alleen met uitzendkrachten via de verloning,
          dan is er geen factuur voor platformkosten: geen korting en ook geen beloning. Koppelen kan alleen met een bedrijf dat zich na
          de introductie aanmeldde, nog geen platformkosten betaalde en waar wie het voorstelde zelf niet bij hoort. In de Android- en
          iPhone-app staat de beloning nergens (18+-keuring); het voorstellen en de twee gratis weken wel.
        </p>
      </APanel>

      {melding && (
        <p role="status" className="rounded-lg px-4 py-2.5 text-[0.8125rem]" style={{ background: "var(--a-elev)", color: "var(--a-dim)" }}>
          {melding}
        </p>
      )}
      {fout && (
        <p role="alert" className="rounded-lg px-4 py-2.5 text-[0.8125rem]" style={{ background: "var(--a-crit-soft)", color: "var(--a-crit)" }}>
          {fout}
        </p>
      )}

      <APanel pad={false}>
        {rijen === null ? (
          <p className="p-8 text-center text-sm" style={{ color: "var(--a-mute)" }}>
            {fout ? "De introducties zijn niet geladen." : "Laden…"}
          </p>
        ) : rijen.length === 0 ? (
          <p className="p-8 text-center text-sm" style={{ color: "var(--a-mute)" }}>
            Nog geen introducties.
          </p>
        ) : (
          <ul className="divide-y" style={{ borderColor: "var(--a-border)" }}>
            {rijen.map((r) => {
              const stand = STAND[r.status];
              const magKoppelen = Boolean(r.leadId) && !r.koppeling && !r.alKlant;
              return (
                <li key={r.id} className="space-y-2 px-5 py-4" style={{ borderColor: "var(--a-border)" }}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold" style={{ color: "var(--a-text)" }}>
                        {r.bedrijf}
                      </p>
                      <p className="text-xs" style={{ color: "var(--a-dim)" }}>
                        {[r.contactNaam, r.email, r.telefoon].filter(Boolean).join(" · ")}
                      </p>
                      <p className="mt-0.5 text-xs" style={{ color: "var(--a-mute)" }}>
                        {dag(r.at)} door {r.door.naam} ({r.rol}){r.door.email ? `, ${r.door.email}` : ""}
                        {r.bestondAl ? " · bestond al als lead" : ""}
                        {r.leadId && !r.eerste ? " · niet de eerste voor deze lead" : ""}
                        {r.leadStatus ? ` · lead: ${r.leadStatus}` : ""}
                      </p>
                      {r.alKlant && (
                        <p className="mt-1 text-xs" style={{ color: "var(--a-dim)" }}>
                          Al klant als {r.alKlant.naam}: geen lead aangemaakt, telt niet mee voor de beloning.
                        </p>
                      )}
                      {r.koppeling && (
                        <p className="mt-1 text-xs" style={{ color: "var(--a-dim)" }}>
                          Gekoppeld aan {r.koppeling.naam} op {dag(r.koppeling.gekoppeldOp)}: geen platformkosten van {dag(r.koppeling.gratisVanaf)} tot en met {dag(r.koppeling.laatsteGratisDag)}.
                        </p>
                      )}
                      {r.beloning && (
                        <p className="mt-1 text-xs" style={{ color: r.beloning.verstuurd ? "var(--a-dim)" : "var(--a-warn)" }}>
                          Eerste factuur {r.beloning.factuurNummer} betaald op {dag(r.beloning.betaaldOp)}.{" "}
                          {r.beloning.verstuurd ? "Bol-tegoed verstuurd." : `Stuur € ${BELONING_EURO} bol-tegoed naar ${r.door.naam}${r.door.email ? ` (${r.door.email})` : ""}.`}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <APill tone={stand.tone}>{stand.label}</APill>
                      {magKoppelen && (
                        <AButton variant="ghost" onClick={() => openKoppelen(r)}>
                          Gekoppeld aan bedrijf
                        </AButton>
                      )}
                      {r.beloning && !r.beloning.verstuurd && (
                        <AButton disabled={bezig} onClick={() => void verstuurd(r)}>
                          Gedaan
                        </AButton>
                      )}
                    </div>
                  </div>

                  {open === r.id && (
                    <div className="rounded-lg p-3" style={{ background: "var(--a-panel-2)" }}>
                      <label htmlFor={`zoek-${r.id}`} className="text-xs font-medium" style={{ color: "var(--a-dim)" }}>
                        Welk bedrijf meldde zich aan? Zoek op naam of op het domein van het e-mailadres.
                      </label>
                      <div className="mt-1 flex flex-wrap gap-2">
                        <input
                          id={`zoek-${r.id}`}
                          value={zoek}
                          onChange={(e) => {
                            setZoek(e.target.value);
                            setGekozen(null);
                          }}
                          maxLength={80}
                          className="min-w-0 flex-1 rounded-md px-2.5 py-1.5 text-sm"
                          style={{ background: "var(--a-elev)", color: "var(--a-text)", border: "1px solid var(--a-border)" }}
                        />
                        <AButton variant="ghost" disabled={zoek.trim().length < 2} onClick={() => void zoekBedrijf()}>
                          Zoek
                        </AButton>
                      </div>
                      {gevonden && gevonden.length === 0 && (
                        <p className="mt-2 text-xs" style={{ color: "var(--a-mute)" }}>
                          Geen bedrijf gevonden. Heeft het zich al aangemeld?
                        </p>
                      )}
                      {gevonden && gevonden.length > 0 && !gekozen && (
                        <ul className="mt-2 space-y-1">
                          {gevonden.map((b) => (
                            <li key={b.id} className="flex items-center justify-between gap-2 text-sm" style={{ color: "var(--a-text)" }}>
                              <span>
                                {b.naam} <span className="text-xs" style={{ color: "var(--a-mute)" }}>sinds {dag(b.sinds)}</span>
                              </span>
                              <AButton variant="ghost" onClick={() => setGekozen(b)}>
                                Kies
                              </AButton>
                            </li>
                          ))}
                        </ul>
                      )}
                      {gekozen && (
                        <div className="mt-2 space-y-2">
                          <p className="text-sm" style={{ color: "var(--a-text)" }}>
                            Koppel de introductie {r.bedrijf} aan {gekozen.naam}? Vanaf vandaag betaalt {gekozen.naam} twee weken geen platformkosten. Dit staat in het auditspoor.
                          </p>
                          <div className="flex gap-2">
                            <AButton disabled={bezig} onClick={() => void koppel(r, gekozen)}>
                              Ja, koppelen
                            </AButton>
                            <AButton variant="ghost" onClick={() => setGekozen(null)}>
                              Terug
                            </AButton>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </APanel>
    </div>
  );
}
