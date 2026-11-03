"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BASE } from "@/lib/voorstel/schwarzwald";

// Klantaccount: inloggen of registreren, en ingelogd je reserveringen zien en
// annuleren, je gegevens aanpassen en uitloggen. Praat met
// /api/voorstel/schwarzwald/account.

export interface AccountGegevens {
  email: string;
  naam: string;
  telefoon: string;
  rol: "klant" | "beheerder";
}
export interface MijnBoeking {
  id: string;
  activiteit: string;
  datum: string;
  tijd: string;
  personen: number;
  status: "nieuw" | "bevestigd" | "geannuleerd";
}

const API = "/api/voorstel/schwarzwald/account";
const VELD = "mt-1.5 w-full rounded-2xl border-0 bg-white px-4 py-3 text-schw-night ring-1 ring-schw-night/15 focus:outline-none focus:ring-2 focus:ring-schw-orange";
const KAART = "rounded-xl3 bg-white p-6 shadow-[0_1px_2px_rgba(10,18,14,0.06)] sm:p-8";
const STATUS: Record<MijnBoeking["status"], string> = { nieuw: "wacht op bevestiging", bevestigd: "bevestigd", geannuleerd: "geannuleerd" };
const dagNaam = (datum: string) =>
  new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${datum}T12:00:00Z`));

async function post(body: Record<string, unknown>) {
  const r = await fetch(API, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const d = (await r.json().catch(() => ({}))) as { error?: { message?: string } } & Record<string, unknown>;
  if (!r.ok) throw new Error(d.error?.message ?? "Er ging iets mis.");
  return d;
}

function Fout({ tekst }: { tekst: string }) {
  return tekst ? (
    <p role="alert" className="mt-4 rounded-2xl bg-[#FDE2E2] p-3 text-sm font-semibold text-[#B91C1C]">
      {tekst}
    </p>
  ) : null;
}

export function SchwarzwaldAccount({
  account,
  boekingen,
  namen,
  vandaag,
}: {
  account: AccountGegevens | null;
  boekingen: MijnBoeking[];
  namen: Record<string, string>;
  vandaag: string;
}) {
  const router = useRouter();
  const [modus, setModus] = useState<"inloggen" | "registreren">("inloggen");
  const [fout, setFout] = useState("");
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState("");

  async function doe(e: FormEvent<HTMLFormElement>, actie: string) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    setBezig(true);
    setFout("");
    setMelding("");
    try {
      await post({ ...data, actie });
      if (actie === "profiel") setMelding("Je gegevens zijn opgeslagen.");
      router.refresh();
    } catch (err) {
      setFout(err instanceof Error ? err.message : "Er ging iets mis.");
    } finally {
      setBezig(false);
    }
  }

  async function annuleer(b: MijnBoeking) {
    if (!window.confirm(`${namen[b.activiteit] ?? b.activiteit} op ${dagNaam(b.datum)} annuleren?`)) return;
    try {
      await post({ actie: "annuleren", datum: b.datum, id: b.id });
      router.refresh();
    } catch (err) {
      setFout(err instanceof Error ? err.message : "Annuleren is niet gelukt.");
    }
  }

  if (!account) {
    return (
      <div className="mx-auto max-w-lg">
        <div className={KAART}>
          <div role="tablist" aria-label="Inloggen of account maken" className="grid grid-cols-2 gap-1 rounded-full bg-schw-sand p-1">
            {(["inloggen", "registreren"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={modus === m}
                onClick={() => {
                  setModus(m);
                  setFout("");
                }}
                className={`rounded-full py-2.5 text-sm font-bold ${modus === m ? "bg-schw-night text-schw-cream" : "text-schw-night"}`}
              >
                {m === "inloggen" ? "Inloggen" : "Account maken"}
              </button>
            ))}
          </div>
          {modus === "inloggen" ? (
            <form onSubmit={(e) => void doe(e, "inloggen")} className="mt-6 space-y-4">
              <label className="block">
                <span className="text-sm font-semibold">E-mailadres</span>
                <input name="email" type="email" required autoComplete="email" className={VELD} />
              </label>
              <label className="block">
                <span className="text-sm font-semibold">Wachtwoord</span>
                <input name="wachtwoord" type="password" required autoComplete="current-password" className={VELD} />
              </label>
              <button type="submit" disabled={bezig} className="w-full rounded-full bg-schw-orange py-4 font-bold text-schw-night disabled:opacity-50">
                {bezig ? "Bezig…" : "Inloggen"}
              </button>
            </form>
          ) : (
            <form onSubmit={(e) => void doe(e, "registreren")} className="mt-6 space-y-4">
              <label className="block">
                <span className="text-sm font-semibold">Naam</span>
                <input name="naam" required autoComplete="name" className={VELD} />
              </label>
              <label className="block">
                <span className="text-sm font-semibold">E-mailadres</span>
                <input name="email" type="email" required autoComplete="email" className={VELD} />
              </label>
              <label className="block">
                <span className="text-sm font-semibold">Telefoonnummer</span>
                <input name="telefoon" type="tel" required autoComplete="tel" className={VELD} />
              </label>
              <label className="block">
                <span className="text-sm font-semibold">Wachtwoord (minimaal 8 tekens)</span>
                <input name="wachtwoord" type="password" required minLength={8} autoComplete="new-password" className={VELD} />
              </label>
              <p className="text-xs text-schw-mute">Dit is een proefaccount voor het ontwerpvoorstel van ZekerFlex. Er worden geen e-mails verstuurd.</p>
              <button type="submit" disabled={bezig} className="w-full rounded-full bg-schw-orange py-4 font-bold text-schw-night disabled:opacity-50">
                {bezig ? "Bezig…" : "Account maken"}
              </button>
            </form>
          )}
          <Fout tekst={fout} />
        </div>
      </div>
    );
  }

  const komend = boekingen.filter((b) => b.datum >= vandaag);
  const eerder = boekingen.filter((b) => b.datum < vandaag);

  return (
    <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
      <section className={KAART}>
        <h2 className="font-display text-2xl font-bold">Mijn reserveringen</h2>
        {komend.length === 0 ? (
          <p className="mt-3 text-schw-mute">
            Nog geen reserveringen.{" "}
            <Link href={`${BASE}/reserveren`} className="font-semibold underline decoration-schw-orange decoration-2 underline-offset-4">
              Reserveer je eerste uitje
            </Link>
          </p>
        ) : (
          <ul className="mt-5 space-y-3">
            {komend.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-schw-cream p-4">
                <div>
                  <p className="font-bold">
                    {namen[b.activiteit] ?? b.activiteit} · {b.personen} personen
                  </p>
                  <p className="text-sm text-schw-mute first-letter:uppercase">
                    {dagNaam(b.datum)} om {b.tijd} · nr. {b.id} · <span className={b.status === "geannuleerd" ? "line-through" : ""}>{STATUS[b.status]}</span>
                  </p>
                </div>
                {b.status !== "geannuleerd" && b.datum > vandaag && (
                  <button type="button" onClick={() => void annuleer(b)} className="rounded-full px-4 py-2 text-sm font-semibold ring-1 ring-schw-night/15">
                    Annuleren
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {eerder.length > 0 && <p className="mt-5 text-sm text-schw-mute">{eerder.length} eerdere reservering(en).</p>}
        <Fout tekst={fout} />
      </section>

      <div className="space-y-6">
        <form onSubmit={(e) => void doe(e, "profiel")} className={KAART}>
          <h2 className="font-display text-xl font-bold">Mijn gegevens</h2>
          <p className="mt-1 text-sm text-schw-mute">{account.email}</p>
          <div className="mt-4 space-y-4">
            <label className="block">
              <span className="text-sm font-semibold">Naam</span>
              <input name="naam" required defaultValue={account.naam} className={VELD} />
            </label>
            <label className="block">
              <span className="text-sm font-semibold">Telefoonnummer</span>
              <input name="telefoon" type="tel" required defaultValue={account.telefoon} className={VELD} />
            </label>
            <label className="block">
              <span className="text-sm font-semibold">Nieuw wachtwoord (mag leeg)</span>
              <input name="nieuwWachtwoord" type="password" minLength={8} autoComplete="new-password" className={VELD} />
            </label>
          </div>
          <button type="submit" disabled={bezig} className="mt-5 w-full rounded-full bg-schw-night py-3 font-bold text-schw-cream disabled:opacity-50">
            Opslaan
          </button>
          {melding && (
            <p role="status" className="mt-3 text-sm font-semibold text-[#15803D]">
              {melding}
            </p>
          )}
        </form>
        <div className="flex flex-wrap gap-3">
          {account.rol === "beheerder" && (
            <Link href={`${BASE}/beheer`} className="rounded-full bg-schw-orange px-6 py-3 font-bold text-schw-night">
              Naar beheer
            </Link>
          )}
          <button
            type="button"
            onClick={() =>
              void post({ actie: "uitloggen" })
                .then(() => router.refresh())
                .catch(() => setFout("Uitloggen is niet gelukt."))
            }
            className="rounded-full px-6 py-3 font-semibold ring-1 ring-schw-night/15"
          >
            Uitloggen
          </button>
        </div>
      </div>
    </div>
  );
}
