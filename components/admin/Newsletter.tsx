"use client";

import { useCallback, useEffect, useState } from "react";

interface Sub {
  email: string;
  status: "pending" | "confirmed" | "unsubscribed";
  source: string;
  createdAt: string;
  confirmedAt: string | null;
}
interface Campaign {
  id: string;
  at: string;
  subject: string;
  recipients: number;
  delivered: number;
  failed: number;
  sentByEmail: string;
  audience?: Audience;
}
type Audience = "subscribers" | "users" | "freelancers" | "employers" | "everyone";
// Mirrors AUDIENCE_LABEL in lib/newsletter/audience (server-only module).
const AUDIENCE_LABEL: Record<Audience, string> = {
  subscribers: "Nieuwsbrief-abonnees",
  users: "Alle gebruikers",
  freelancers: "Freelancers",
  employers: "Werkgevers",
  everyone: "Iedereen (abonnees + gebruikers)",
};
interface Payload {
  stats: { total: number; confirmed: number; pending: number; unsubscribed: number };
  audiences?: Record<Audience, number>;
  smtp: boolean;
  from: string;
  subscribers: Sub[];
  campaigns: Campaign[];
}

const TEMPLATES: { label: string; subject: string; body: string }[] = [
  {
    label: "App-testers werven",
    subject: "Test jij als eerste de ZekerFlex-app? 📱",
    body: `Hoi,

De ZekerFlex-app voor Android is klaar om getest te worden, en we zoeken mensen die hem als eerste willen uitproberen.

In de app kun je klussen bij jou in de buurt vinden en erop reageren, je uren schrijven en je verdiensten bijhouden, direct chatten met opdrachtgevers of freelancers, en meldingen krijgen zodra er iets voor je klaarstaat.

Zo doe je mee:
1. Stuur ons je Gmail-adres: antwoord op deze mail met het Gmail-adres dat je in de Play Store op je telefoon gebruikt. We zetten je dan op de testerslijst.
2. Open deze link op je Android-telefoon: https://play.google.com/apps/testing/com.zekerflex.app
3. Tik op "Word tester" en installeer de app via Google Play.

Zie je "app niet beschikbaar"? Dan staat je adres nog niet op de lijst. Probeer het een paar uur later nog eens.

Onze vraag aan jou: houd de app minstens 14 dagen geïnstalleerd en gebruik hem af en toe. Zie je iets wat niet werkt of beter kan? Antwoord gewoon op deze mail.

Heb je een iPhone? De iOS-versie volgt later. Tot die tijd werkt alles via www.zekerflex.com.

Bedankt dat je ons helpt!

Team ZekerFlex`,
  },
];

const STATUS_LABEL: Record<Sub["status"], string> = {
  pending: "wacht op bevestiging",
  confirmed: "bevestigd",
  unsubscribed: "afgemeld",
};

export function Newsletter() {
  const [data, setData] = useState<Payload | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<Audience>("everyone");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | Sub["status"]>("all");
  const [query, setQuery] = useState("");
  const [unsubBusy, setUnsubBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/nieuwsbrief", { cache: "no-store" });
      if (res.ok) setData(await res.json());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function send(test: boolean) {
    if (busy) return;
    if (!test && !window.confirm(`Mail versturen naar ${count} ontvangers (${AUDIENCE_LABEL[audience]})?`)) {
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/admin/nieuwsbrief/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, body, audience, test }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNote(d?.error?.message ?? "Versturen mislukt.");
      } else if (test) {
        setNote(`Testmail verstuurd naar jezelf (${d.delivered}/${d.recipients} afgeleverd).`);
      } else {
        setNote(`Verstuurd: ${d.delivered} afgeleverd, ${d.failed} mislukt van ${d.recipients}.`);
        setSubject("");
        setBody("");
        void refresh();
      }
    } catch {
      setNote("Versturen mislukt — geen verbinding.");
    } finally {
      setBusy(false);
    }
  }

  const s = data?.stats;
  const count = data?.audiences?.[audience] ?? (audience === "subscribers" ? (s?.confirmed ?? 0) : 0);
  const q = query.trim().toLowerCase();
  const subs = (data?.subscribers ?? []).filter((x) => (filter === "all" || x.status === filter) && (!q || x.email.toLowerCase().includes(q)));

  async function unsubscribe(email: string) {
    if (!window.confirm(`${email} afmelden voor de nieuwsbrief?`)) return;
    setUnsubBusy(email);
    try {
      const res = await fetch("/api/admin/nieuwsbrief/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.ok) await refresh();
    } finally {
      setUnsubBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Nieuwsbrief &amp; mail aan gebruikers</h1>
        <p className="mt-1 text-sm text-neutralx-600">
          Schrijf één mail en stuur hem in één keer naar abonnees, alle gebruikers, alleen freelancers of alleen werkgevers.
        </p>
      </div>

      {/* stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Bevestigd", s?.confirmed ?? 0, "text-ok"],
          ["Wacht op bevestiging", s?.pending ?? 0, "text-warn"],
          ["Afgemeld", s?.unsubscribed ?? 0, "text-neutralx-400"],
          ["Totaal", s?.total ?? 0, "text-ink"],
        ].map(([label, val, cls]) => (
          <div key={label as string} className="card p-4">
            <div className={`num text-2xl font-bold ${cls as string}`}>{val as number}</div>
            <div className="mt-1 text-xs text-neutralx-500">{label as string}</div>
          </div>
        ))}
      </div>

      {!data?.smtp && (
        <p className="rounded-lg border border-warn/30 bg-warn/5 px-4 py-3 text-sm text-neutralx-700">
          Geen mailserver ingesteld — uitgaven worden alleen lokaal in de mailbox bewaard.
        </p>
      )}

      {/* compose */}
      <div className="card space-y-3 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">Nieuwe mail</span>
          {TEMPLATES.map((t) => (
            <button
              key={t.label}
              type="button"
              onClick={() => {
                if ((subject || body) && !window.confirm("Huidige tekst vervangen door het sjabloon?")) return;
                setSubject(t.subject);
                setBody(t.body);
              }}
              className="ml-auto rounded-full border border-hairstrong px-2.5 py-1 text-xs text-neutralx-600 hover:bg-paper-soft"
            >
              Sjabloon: {t.label}
            </button>
          ))}
        </div>
        <div>
          <div className="mb-1.5 text-xs text-neutralx-500">Naar wie?</div>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(AUDIENCE_LABEL) as Audience[]).map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAudience(a)}
                className={`rounded-full px-3 py-1.5 text-xs ${
                  audience === a ? "bg-ink text-white" : "bg-paper-soft text-neutralx-600 hover:bg-hair"
                }`}
              >
                {AUDIENCE_LABEL[a]} <span className="num opacity-70">({data?.audiences?.[a] ?? "…"})</span>
              </button>
            ))}
          </div>
          {audience !== "subscribers" && (
            <p className="mt-1.5 text-xs text-neutralx-500">
              Alleen gebruikers met een bevestigd e-mailadres. Wie zich ooit heeft afgemeld, krijgt niets. Elke mail heeft een afmeldlink.
            </p>
          )}
        </div>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Onderwerp"
          className="w-full rounded-lg border border-hairstrong bg-white px-3 py-2 text-sm"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Bericht. Lege regel = nieuwe alinea. Links (https://…) worden vanzelf klikbaar."
          rows={9}
          className="w-full rounded-lg border border-hairstrong bg-white px-3 py-2 text-sm leading-relaxed"
        />
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => send(false)}
            disabled={busy || subject.length < 3 || body.length < 10 || count === 0}
            className="btn-primary text-sm disabled:opacity-50"
          >
            {busy ? "Bezig… (laat dit venster open)" : `Versturen naar ${count} ontvangers`}
          </button>
          <button
            type="button"
            onClick={() => send(true)}
            disabled={busy || subject.length < 3 || body.length < 10}
            className="btn-ghost text-sm disabled:opacity-50"
          >
            Eerst naar mezelf testen
          </button>
          <span className="text-xs text-neutralx-500">Van: {data?.from ?? "…"}</span>
        </div>
        {note && <p className="text-sm text-neutralx-700">{note}</p>}
      </div>

      {/* campaign history */}
      {data && data.campaigns.length > 0 && (
        <div className="card overflow-hidden">
          <div className="border-b border-hair px-5 py-3 text-sm font-semibold">Verstuurde mails</div>
          <ul className="divide-y divide-hair text-sm">
            {data.campaigns.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3">
                <span className="min-w-0 flex-1 truncate font-medium text-ink">{c.subject}</span>
                <span className="text-xs text-neutralx-500">
                  {new Date(c.at).toLocaleString("nl-NL")} · {AUDIENCE_LABEL[c.audience ?? "subscribers"] ?? c.audience} ·{" "}
                  {c.delivered}/{c.recipients} afgeleverd
                  {c.failed > 0 ? ` · ${c.failed} mislukt` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* subscribers */}
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-hair px-5 py-3">
          <span className="text-sm font-semibold">Abonnees ({subs.length})</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Zoek e-mailadres…"
            className="w-40 rounded-lg border border-hairstrong bg-white px-2.5 py-1 text-xs"
          />
          <div className="ml-auto flex gap-1">
            {(["all", "confirmed", "pending", "unsubscribed"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`rounded-full px-2.5 py-1 text-xs ${
                  filter === f ? "bg-ink text-white" : "bg-paper-soft text-neutralx-600"
                }`}
              >
                {f === "all" ? "alle" : STATUS_LABEL[f]}
              </button>
            ))}
          </div>
        </div>
        {subs.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-neutralx-400">{q || filter !== "all" ? "Niets gevonden." : "Nog geen inschrijvingen."}</p>
        ) : (
          <ul className="max-h-96 divide-y divide-hair overflow-y-auto text-sm">
            {subs.map((x) => (
              <li key={x.email} className="flex items-center gap-3 px-5 py-2.5">
                <span className="min-w-0 flex-1 truncate">{x.email}</span>
                <span className="text-xs text-neutralx-400">{x.source}</span>
                <span
                  className={`text-xs ${
                    x.status === "confirmed"
                      ? "text-ok"
                      : x.status === "pending"
                        ? "text-warn"
                        : "text-neutralx-400"
                  }`}
                >
                  {STATUS_LABEL[x.status]}
                </span>
                {x.status !== "unsubscribed" && (
                  <button
                    type="button"
                    onClick={() => unsubscribe(x.email)}
                    disabled={unsubBusy === x.email}
                    className="text-xs text-neutralx-400 underline hover:text-crit disabled:opacity-50"
                  >
                    {unsubBusy === x.email ? "bezig…" : "afmelden"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
