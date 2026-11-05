"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Werkgever → Inchecken op locatie: terminals per vestiging (een tablet of oude
// telefoon aan de muur), de sticker om te printen of op een NFC-tag te zetten,
// en de check-ins van vandaag. Data: /api/werkgever/terminals (lib/incheck/store.ts).
// De schermlink met de sleutel zie je alleen direct na het maken of vernieuwen.
// ---------------------------------------------------------------------------

interface Terminal {
  id: string;
  branchId: string;
  naam: string;
  code: string;
  actief: boolean;
  createdAt: string;
  laatstGezien?: string;
}
interface Regel {
  tijd: string;
  type: "in" | "uit";
  naam: string;
  terminalId: string;
  dienst: string;
}
interface Data {
  terminals: Terminal[];
  branches: { id: string; name: string; city: string }[];
  vandaag: Regel[];
}

const API = "/api/werkgever/terminals";
const tijd = (s: string) => new Date(s).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" });

export function TerminalsBeheer({ origin }: { origin: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [naam, setNaam] = useState("Ingang");
  const [branchId, setBranchId] = useState("");
  const [bezig, setBezig] = useState(false);
  /** de schermlink van een zojuist gemaakte of vernieuwde terminal */
  const [link, setLink] = useState<{ id: string; url: string } | null>(null);
  const [gekopieerd, setGekopieerd] = useState(false);

  const laad = useCallback(async () => {
    const res = await fetch(API, { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return setFout("De terminals konden niet laden. Probeer het opnieuw.");
    const d = (await res.json()) as Data;
    setData(d);
    setBranchId((b) => b || d.branches[0]?.id || "");
    setFout(null);
  }, []);
  useEffect(() => {
    void laad();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void laad();
    }, 60_000);
    return () => clearInterval(t);
  }, [laad]);

  async function vraag(method: "POST" | "PATCH" | "DELETE", body?: Record<string, unknown>, query = "") {
    setBezig(true);
    setFout(null);
    try {
      const res = await fetch(`${API}${query}`, { method, headers: { "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
      const d = (await res.json().catch(() => ({}))) as { error?: { message?: string }; terminal?: Terminal; sleutel?: string };
      if (!res.ok) {
        setFout(d.error?.message ?? "Dat lukte niet.");
        return null;
      }
      return d;
    } finally {
      setBezig(false);
    }
  }

  async function maak(e: FormEvent) {
    e.preventDefault();
    const d = await vraag("POST", { branchId, naam });
    if (d?.terminal && d.sleutel) {
      setLink({ id: d.terminal.id, url: `${origin}/terminal/${d.sleutel}` });
      setNaam("Ingang");
      await laad();
    }
  }
  async function nieuweSleutel(id: string) {
    const d = await vraag("PATCH", { id, nieuweSleutel: true });
    if (d?.sleutel) setLink({ id, url: `${origin}/terminal/${d.sleutel}` });
  }
  async function zet(id: string, actief: boolean) {
    if (await vraag("PATCH", { id, actief })) await laad();
  }
  async function verwijder(id: string) {
    if (await vraag("DELETE", undefined, `?id=${encodeURIComponent(id)}`)) {
      if (link?.id === id) setLink(null);
      await laad();
    }
  }
  async function kopieer(tekst: string) {
    try {
      await navigator.clipboard.writeText(tekst);
      setGekopieerd(true);
      setTimeout(() => setGekopieerd(false), 2000);
    } catch {
      /* dan selecteert de gebruiker de link zelf */
    }
  }

  const branchNaam = (id: string) => data?.branches.find((b) => b.id === id)?.name ?? "Vestiging";
  const terminalNaam = (id: string) => data?.terminals.find((t) => t.id === id)?.naam ?? "terminal";
  const online = (t: Terminal) => t.laatstGezien && Date.now() - Date.parse(t.laatstGezien) < 10 * 60_000;

  return (
    <div className="space-y-6">
      {fout && (
        <p role="alert" className="rounded-xl bg-crit/10 px-4 py-3 text-sm font-medium text-crit">
          {fout}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {[
          ["📱", "QR op het scherm", "De tablet toont een code die elke minuut wisselt. De kracht scant hem met de telefoon en tikt op Inchecken."],
          ["🏷️", "NFC-sticker", "Zet de link van de terminal op een NFC-sticker bij de ingang. Een tik met de telefoon opent de incheckpagina."],
          ["🔑", "Sleutelhanger", "Een kracht koppelt eenmalig een NFC-sleutelhanger en houdt die daarna tegen de tablet: inchecken zonder telefoon."],
        ].map(([icoon, kop, tekst]) => (
          <div key={kop} className="card p-5">
            <p className="text-2xl" aria-hidden>
              {icoon}
            </p>
            <p className="mt-2 font-semibold text-ink">{kop}</p>
            <p className="mt-1 text-sm text-neutralx-600">{tekst}</p>
          </div>
        ))}
      </div>

      {link && (
        <div className="card space-y-3 border-brand-500/40 p-5">
          <p className="font-semibold text-ink">Schermlink voor {terminalNaam(link.id)}</p>
          <p className="text-sm text-neutralx-600">Open dit adres op de tablet aan de muur (Chrome, volledig scherm). Bewaar hem veilig: wie de link heeft, kan het scherm tonen. Je ziet hem alleen nu; later kun je een nieuwe maken.</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 overflow-x-auto rounded-xl bg-paper-soft px-3 py-2 text-xs">{link.url}</code>
            <button type="button" onClick={() => void kopieer(link.url)} className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white">
              {gekopieerd ? "Gekopieerd" : "Kopieer"}
            </button>
            <a href={link.url} target="_blank" rel="noopener noreferrer" className="rounded-xl border border-hair px-4 py-2 text-sm font-semibold text-ink">
              Open scherm
            </a>
          </div>
        </div>
      )}

      <div className="card p-5">
        <p className="font-semibold text-ink">Terminal toevoegen</p>
        {data && data.branches.length === 0 ? (
          <p className="mt-2 text-sm text-neutralx-600">
            Voeg eerst een vestiging toe onder{" "}
            <Link href="/werkgever/bedrijf" className="font-semibold text-brand-600 hover:underline">
              Bedrijfsprofiel
            </Link>
            .
          </p>
        ) : (
          <form onSubmit={maak} className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <label className="grid gap-1 text-sm font-medium text-ink">
              Naam (bijv. Ingang, Magazijn)
              <input className="field-input" value={naam} maxLength={60} onChange={(e) => setNaam(e.target.value)} required />
            </label>
            <label className="grid gap-1 text-sm font-medium text-ink">
              Vestiging
              <select className="field-input" value={branchId} onChange={(e) => setBranchId(e.target.value)} required>
                {(data?.branches ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} · {b.city}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" disabled={bezig || !branchId} className="rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
              Maak terminal
            </button>
          </form>
        )}
      </div>

      <div className="card p-0">
        <p className="px-5 pt-4 font-semibold text-ink">Je terminals</p>
        {!data ? (
          <p className="px-5 pb-5 pt-2 text-sm text-neutralx-500">Laden…</p>
        ) : data.terminals.length === 0 ? (
          <p className="px-5 pb-5 pt-2 text-sm text-neutralx-500">Nog geen terminal. Maak er hierboven een; daarna print je de sticker en open je het scherm op een tablet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-hair">
            {data.terminals.map((t) => (
              <li key={t.id} className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                <div className="min-w-0">
                  <p className="font-semibold text-ink">
                    {t.naam} <span className="font-normal text-neutralx-500">· {branchNaam(t.branchId)}</span>{" "}
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${!t.actief ? "bg-paper-soft text-neutralx-500" : online(t) ? "bg-ok/10 text-ok" : "bg-warn/10 text-warn"}`}>
                      {!t.actief ? "Uit" : online(t) ? "Scherm actief" : "Scherm niet gezien"}
                    </span>
                  </p>
                  <p className="mt-0.5 text-sm text-neutralx-500">
                    Stickerlink: <code className="rounded bg-paper-soft px-1.5 py-0.5 text-xs">{origin}/i/{t.code}</code>
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link href={`/werkgever/inchecken/sticker/${t.id}`} className="rounded-xl border border-hair px-3 py-1.5 text-sm font-semibold text-ink">
                    Sticker printen
                  </Link>
                  <button type="button" disabled={bezig} onClick={() => void nieuweSleutel(t.id)} className="rounded-xl border border-hair px-3 py-1.5 text-sm font-semibold text-ink">
                    Nieuwe schermlink
                  </button>
                  <button type="button" disabled={bezig} onClick={() => void zet(t.id, !t.actief)} className="rounded-xl border border-hair px-3 py-1.5 text-sm font-semibold text-ink">
                    {t.actief ? "Uitzetten" : "Aanzetten"}
                  </button>
                  <button type="button" disabled={bezig} onClick={() => void verwijder(t.id)} className="rounded-xl px-3 py-1.5 text-sm font-semibold text-crit hover:underline">
                    Verwijderen
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card p-0">
        <p className="px-5 pt-4 font-semibold text-ink">Vandaag bij de terminals</p>
        {!data ? null : data.vandaag.length === 0 ? (
          <p className="px-5 pb-5 pt-2 text-sm text-neutralx-500">Nog niemand in- of uitgecheckt via een terminal vandaag.</p>
        ) : (
          <ul className="mt-2 divide-y divide-hair text-sm">
            {data.vandaag.map((r, i) => (
              <li key={`${r.tijd}-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5">
                <span className="font-mono font-semibold tabular-nums text-ink">{tijd(r.tijd)}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${r.type === "in" ? "bg-ok/10 text-ok" : "bg-plan-soft text-plan-ink"}`}>{r.type === "in" ? "In" : "Uit"}</span>
                <span className="font-medium text-ink">{r.naam}</span>
                <span className="text-neutralx-500">
                  {r.dienst} · {terminalNaam(r.terminalId)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
