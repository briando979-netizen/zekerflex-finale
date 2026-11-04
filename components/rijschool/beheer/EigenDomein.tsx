"use client";

import { useState } from "react";
import type { BeheerWeergave } from "@/lib/rijschool/weergave";
import type { Doe } from "@/components/rijschool/beheer/RijschoolBeheer";
import { foutVan } from "@/components/rijschool/api";
import { Melding, Veld } from "@/components/rijschool/ui";

// Een eigen domein voor website en app (lib/rijschool/domein.ts): domein
// invullen, de DNS-regels overnemen bij de domeinprovider en controleren.
// Een los blok naast het formulier met de teksten (geen formulier in een formulier).

const tijd = (iso: string) =>
  new Date(iso).toLocaleString("nl-NL", {
    timeZone: "Europe/Amsterdam",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });

export function EigenDomein({ data, doe }: { data: BeheerWeergave; doe: Doe }) {
  const [invoer, setInvoer] = useState("");
  const [bezig, setBezig] = useState<"koppel" | "controleer" | "weg" | null>(
    null,
  );
  const [fout, setFout] = useState<string | null>(null);
  const [gekopieerd, setGekopieerd] = useState<string | null>(null);
  const d = data.domein;
  const c = d?.controle ?? null;

  async function voer(soort: "koppel" | "controleer" | "weg") {
    setFout(null);
    setBezig(soort);
    try {
      if (soort === "koppel") {
        await doe({ actie: "domein", domein: invoer });
        setInvoer("");
      } else if (soort === "controleer") {
        await doe({ actie: "domeinControleer" });
      } else {
        await doe({ actie: "domeinWeg" });
      }
    } catch (err) {
      setFout(foutVan(err));
    } finally {
      setBezig(null);
    }
  }

  async function kopieer(waarde: string) {
    try {
      await navigator.clipboard.writeText(waarde);
      setGekopieerd(waarde);
      setTimeout(() => setGekopieerd(null), 1500);
    } catch {
      setGekopieerd(null);
    }
  }

  if (!d) {
    return (
      <section className="card space-y-3 p-5">
        <h2 className="font-display text-lg font-bold text-ink">
          Eigen domein
        </h2>
        <p className="text-sm text-neutralx-600">
          Zet je website en app op je eigen domeinnaam, zoals
          rijschooljansen.nl. Alles blijft bij ZekerFlex staan; je zet alleen
          een paar regels bij je domeinprovider. Tot die tijd werkt{" "}
          <span className="font-medium text-ink">
            {data.rijschool.url.replace(/^https?:\/\//, "")}
          </span>{" "}
          gewoon.
        </p>
        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            void voer("koppel");
          }}
        >
          <div className="flex-1">
            <Veld label="Je domeinnaam">
              <input
                className="field-input"
                value={invoer}
                onChange={(e) => setInvoer(e.target.value)}
                placeholder="rijschooljansen.nl"
                autoComplete="off"
                spellCheck={false}
                maxLength={253}
              />
            </Veld>
          </div>
          <button
            type="submit"
            className="btn-primary"
            disabled={bezig !== null || !invoer.trim()}
          >
            {bezig === "koppel" ? "Bezig…" : "Koppelen"}
          </button>
        </form>
        <p className="text-xs text-neutralx-500">
          Nog geen domeinnaam?{" "}
          <a
            href="/domeinnaam"
            target="_blank"
            rel="noopener"
            className="font-semibold text-brand-600 hover:underline"
          >
            Zoek er één
          </a>
          .
        </p>
        <Melding fout={fout} />
      </section>
    );
  }

  const punten: { label: string; ok: boolean | null }[] = [
    {
      label: "Het domein is van jou (TXT-regel)",
      ok: d.geverifieerd ? true : c ? c.txt : null,
    },
    { label: `${d.host} wijst naar ZekerFlex`, ok: c ? c.a : null },
    {
      label: "Geen oude IPv6-regel naar een ander adres",
      ok: c ? c.aaaa : null,
    },
    ...(d.alias
      ? [{ label: `${d.alias} doet mee`, ok: c ? c.alias : null }]
      : []),
    { label: "Beveiligde verbinding (https)", ok: c ? c.https : null },
  ];

  return (
    <section className="card space-y-4 p-5 text-sm">
      <h2 className="font-display text-lg font-bold text-ink">Eigen domein</h2>
      {d.actief ? (
        <p role="status" className="rounded-lg bg-ok/10 p-3 text-ok">
          Je website en app staan op{" "}
          <a
            href={`https://${d.host}`}
            target="_blank"
            rel="noopener"
            className="font-semibold underline"
          >
            {d.host}
          </a>
          . Leerlingen loggen in via https://{d.host}/leerling.
        </p>
      ) : (
        <p className="text-neutralx-600">
          Zet deze regels bij je domeinprovider voor{" "}
          <strong className="text-ink">{d.host}</strong> en druk daarna op
          Controleer. Laat de MX-regels voor je e-mail staan zoals ze zijn.
        </p>
      )}

      <ul className="space-y-2">
        {d.regels.map((r) => (
          <li
            key={`${r.type}${r.name}`}
            className="rounded-lg border border-hair p-2.5"
          >
            <p className="flex items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-ink">
                {r.type} · naam {r.short}
              </span>
              <button
                type="button"
                onClick={() => void kopieer(r.value)}
                className="font-semibold text-brand-600 hover:underline"
              >
                {gekopieerd === r.value ? "Gekopieerd" : "Kopieer waarde"}
              </button>
            </p>
            <p className="mt-1 break-all font-mono text-xs text-ink">
              {r.value}
            </p>
            <p className="mt-1 text-xs text-neutralx-500">{r.why}</p>
          </li>
        ))}
      </ul>

      <div className="space-y-2">
        <ul className="space-y-1" aria-label="Stand van je domein">
          {punten.map((p) => (
            <li key={p.label} className="flex items-start gap-2 text-xs">
              <span
                aria-hidden
                className={
                  p.ok === null
                    ? "text-neutralx-400"
                    : p.ok
                      ? "text-ok"
                      : "text-crit"
                }
              >
                {p.ok === null ? "–" : p.ok ? "✓" : "✗"}
              </span>
              <span className="text-neutralx-700">
                {p.label}
                <span className="sr-only">
                  {p.ok === null
                    ? ": nog niet gecontroleerd"
                    : p.ok
                      ? ": in orde"
                      : ": nog niet in orde"}
                </span>
              </span>
            </li>
          ))}
        </ul>
        {c?.probleem && (
          <p
            role="status"
            className="rounded-lg bg-paper-soft p-3 text-xs text-neutralx-700"
          >
            {c.probleem}
          </p>
        )}
        {c && (
          <p className="text-[11px] text-neutralx-500">
            Laatst gecontroleerd {tijd(c.at)}
          </p>
        )}
      </div>

      <Melding fout={fout} />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-primary"
          disabled={bezig !== null}
          onClick={() => void voer("controleer")}
        >
          {bezig === "controleer"
            ? "Controleren… (kan een halve minuut duren)"
            : "Controleer"}
        </button>
        <button
          type="button"
          className="btn-ghost"
          disabled={bezig !== null}
          onClick={() => {
            if (
              window.confirm(
                `${d.host} loskoppelen? Je website blijft bereikbaar op ${data.rijschool.url.replace(/^https?:\/\//, "")}.`,
              )
            )
              void voer("weg");
          }}
        >
          {bezig === "weg" ? "Bezig…" : "Domein loskoppelen"}
        </button>
      </div>
    </section>
  );
}
