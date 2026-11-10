"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { HARDWARE, PAKKETTEN } from "@/lib/hardware/catalogus";
import { Notice, Pill } from "@/components/admin/kit";

// Een installatieafspraak maken en de links delen: de klantlink (volgen) en de monteurlink (knoppen en
// positie). De links staan alleen hier; wie ze heeft, heeft toegang tot die ene afspraak.

export interface AfspraakRij {
  id: string;
  klantNaam: string;
  adres: string;
  plaats: string;
  venster: string;
  monteurNaam: string;
  status: string;
  statusLabel: string;
  klantLink: string;
  monteurLink: string;
}

const TONE: Record<string, "neutral" | "plan" | "ok" | "warn"> = { gepland: "plan", onderweg: "warn", aangekomen: "warn", bezig: "warn", klaar: "ok", geannuleerd: "neutral" };

function Kopieer({ tekst, label }: { tekst: string; label: string }) {
  const [gedaan, setGedaan] = useState(false);
  return (
    <button
      type="button"
      className="a-button text-xs"
      onClick={() => {
        void navigator.clipboard.writeText(tekst).then(() => {
          setGedaan(true);
          setTimeout(() => setGedaan(false), 2000);
        });
      }}
    >
      {gedaan ? "Gekopieerd" : label}
    </button>
  );
}

const morgen = () => new Date(Date.now() + 86_400_000).toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });

export function InstallatieAdmin({ afspraken }: { afspraken: AfspraakRij[] }) {
  const router = useRouter();
  const [klantNaam, setKlantNaam] = useState("");
  const [adres, setAdres] = useState("");
  const [datum, setDatum] = useState(morgen());
  const [van, setVan] = useState("13:00");
  const [tot, setTot] = useState("15:00");
  const [monteurNaam, setMonteurNaam] = useState("");
  const [regels, setRegels] = useState("");
  const [notitie, setNotitie] = useState("");
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState<{ ok: boolean; tekst: string } | null>(null);

  function vulUitPakket(id: string) {
    const p = PAKKETTEN.find((x) => x.id === id);
    if (!p) return;
    setRegels(p.regels.map((r) => `${r.aantal} × ${HARDWARE.find((i) => i.id === r.item)?.naam ?? r.item}`).join("\n"));
  }

  async function maak(e: React.FormEvent) {
    e.preventDefault();
    if (bezig) return;
    setBezig(true);
    setMelding(null);
    try {
      const res = await fetch("/api/admin/installaties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ klantNaam, adres, datum, van, tot, monteurNaam, regels: regels.split("\n").map((r) => r.trim()).filter(Boolean), notitie }),
      });
      const d: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = d && typeof d === "object" && "error" in d ? (d as { error?: { message?: unknown } }).error?.message : null;
        setMelding({ ok: false, tekst: typeof msg === "string" ? msg : "Aanmaken lukte niet. Probeer het opnieuw." });
        return;
      }
      setMelding({ ok: true, tekst: "De afspraak staat klaar. Kopieer hieronder de klantlink en de monteurlink." });
      setKlantNaam("");
      setAdres("");
      setRegels("");
      setNotitie("");
      router.refresh();
    } catch {
      setMelding({ ok: false, tekst: "Aanmaken lukte niet. Probeer het opnieuw." });
    } finally {
      setBezig(false);
    }
  }

  async function annuleer(id: string) {
    if (!window.confirm("Deze afspraak annuleren? De klant ziet dan dat hij is geannuleerd.")) return;
    const res = await fetch("/api/admin/installaties", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, naar: "geannuleerd" }) });
    if (res.ok) router.refresh();
    else setMelding({ ok: false, tekst: "Annuleren lukte niet. Mogelijk is de installatie al bezig of klaar." });
  }

  return (
    <div className="space-y-5">
      {melding && <Notice tone={melding.ok ? "ok" : "crit"} role={melding.ok ? "status" : "alert"}>{melding.tekst}</Notice>}

      <form onSubmit={(e) => void maak(e)} className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm"><span className="font-medium">Klant (naam van de zaak)</span><input value={klantNaam} onChange={(e) => setKlantNaam(e.target.value)} required className="a-input mt-1 w-full" /></label>
        <label className="block text-sm"><span className="font-medium">Adres van de installatie</span><input value={adres} onChange={(e) => setAdres(e.target.value)} required placeholder="Straat 1, 1234 AB Plaats" className="a-input mt-1 w-full" /></label>
        <label className="block text-sm"><span className="font-medium">Datum</span><input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} required className="a-input mt-1 w-full" /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm"><span className="font-medium">Tijdvak van</span><input type="time" value={van} onChange={(e) => setVan(e.target.value)} required className="a-input mt-1 w-full" /></label>
          <label className="block text-sm"><span className="font-medium">tot</span><input type="time" value={tot} onChange={(e) => setTot(e.target.value)} required className="a-input mt-1 w-full" /></label>
        </div>
        <label className="block text-sm"><span className="font-medium">Monteur</span><input value={monteurNaam} onChange={(e) => setMonteurNaam(e.target.value)} required className="a-input mt-1 w-full" /></label>
        <label className="block text-sm">
          <span className="font-medium">Vul de lijst uit een pakket</span>
          <select defaultValue="" onChange={(e) => e.target.value && vulUitPakket(e.target.value)} className="a-input mt-1 w-full">
            <option value="">Kies een pakket (of typ zelf)</option>
            {PAKKETTEN.map((p) => <option key={p.id} value={p.id}>{p.naam}</option>)}
          </select>
        </label>
        <label className="block text-sm sm:col-span-2"><span className="font-medium">Wat er wordt geïnstalleerd (één regel per apparaat)</span><textarea value={regels} onChange={(e) => setRegels(e.target.value)} rows={4} className="a-input mt-1 w-full" /></label>
        <label className="block text-sm sm:col-span-2"><span className="font-medium">Opmerking voor de monteur (de klant ziet dit niet)</span><textarea value={notitie} onChange={(e) => setNotitie(e.target.value)} rows={2} className="a-input mt-1 w-full" /></label>
        <div className="sm:col-span-2">
          <button type="submit" disabled={bezig} className="a-button a-button-primary text-sm">{bezig ? "Bezig…" : "Afspraak maken"}</button>
        </div>
      </form>

      <div>
        <h3 className="mb-2 text-sm font-semibold" style={{ color: "var(--a-text)" }}>Afspraken</h3>
        {afspraken.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--a-mute)" }}>Nog geen afspraken.</p>
        ) : (
          <ul className="space-y-3">
            {afspraken.map((a) => {
              const mail = `mailto:?subject=${encodeURIComponent("Je ZekerFlex-installatie volgen")}&body=${encodeURIComponent(`Hoi,\n\nJe installatie staat gepland: ${a.venster}.\nVolg onze monteur hier, ook op de dag zelf op de kaart:\n${a.klantLink}\n\nTeam ZekerFlex`)}`;
              return (
                <li key={a.id} className="rounded-xl p-3 text-[0.8125rem]" style={{ border: "1px solid var(--a-border)" }}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <span className="font-medium" style={{ color: "var(--a-text)" }}>{a.klantNaam}</span>
                      <span style={{ color: "var(--a-mute)" }}> · {a.adres}, {a.plaats}</span>
                    </span>
                    <Pill tone={TONE[a.status] ?? "neutral"}>{a.statusLabel}</Pill>
                  </div>
                  <p className="mt-0.5 text-xs" style={{ color: "var(--a-mute)" }}>{a.venster} · monteur {a.monteurNaam}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Kopieer tekst={a.klantLink} label="Kopieer klantlink" />
                    <Kopieer tekst={a.monteurLink} label="Kopieer monteurlink" />
                    <a href={mail} className="a-button text-xs">Mail voor de klant</a>
                    <a href={a.klantLink} target="_blank" rel="noopener noreferrer" className="a-button text-xs">Bekijk als klant ↗</a>
                    {(a.status === "gepland" || a.status === "onderweg" || a.status === "aangekomen") && (
                      <button type="button" className="a-button text-xs" onClick={() => void annuleer(a.id)}>Annuleren</button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
