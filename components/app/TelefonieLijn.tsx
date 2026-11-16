"use client";

import { useEffect, useState, type FormEvent } from "react";
import { selectedOptions } from "@/lib/telephony/plans";
import { BEL_SECONDEN, MAX_MENU, MAX_NUMMERS, nummerTekst, WEEKDAGEN, type LijnBericht, type LijnInstellingen } from "@/lib/telephony/lijn";
import type { LineScope, PhoneLine } from "@/lib/telephony/lines";
import type { LijnTeksten } from "@/lib/telephony/lijn-teksten";
import { vulIn } from "@/lib/i18n/vul-in";

// ---------------------------------------------------------------------------
// Een actieve lijn beheren (16 nov 2026): de berichten (terugbelverzoek, voicemail met uitgeschreven tekst, opname,
// sms, gemist) en de instellingen die bepalen hoe een gesprek loopt (lib/telephony/lijn.ts). Alleen wat bij de lijn
// hoort: zonder teamnummer één doorschakelnummer, zonder keuzemenu geen menu. Laadt zelf (alleen in de browser,
// dus geen verschil tussen server en browser bij de tijden).
// ---------------------------------------------------------------------------

const API = "/api/telefonie";
const BELTIJDEN = [10, 15, 20, 25, 30, 40].filter((s) => s >= BEL_SECONDEN.min && s <= BEL_SECONDEN.max);
const wanneer = (iso: string) => new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" }).format(new Date(iso));
const veld = "w-full rounded-lg border border-hairstrong px-3 py-2 text-sm";

export function TelefonieLijn({ scope, line, kanInstellen, texts: t }: { scope: LineScope; line: PhoneLine; kanInstellen: boolean; texts: LijnTeksten }) {
  const opties = selectedOptions(line.selection);
  const [tab, setTab] = useState<"berichten" | "instellingen">("berichten");
  const [berichten, setBerichten] = useState<LijnBericht[] | null>(null);
  const [inst, setInst] = useState<LijnInstellingen | null>(null);
  const [fout, setFout] = useState("");
  const [ok, setOk] = useState("");
  const [bezig, setBezig] = useState(false);
  const [smsVoor, setSmsVoor] = useState<string | null>(null);
  const [smsTekst, setSmsTekst] = useState("");

  useEffect(() => {
    let weg = false;
    void (async () => {
      const r = await fetch(`${API}?scope=${scope}`, { cache: "no-store" }).catch(() => null);
      const d = (r?.ok ? await r.json().catch(() => null) : null) as { actief?: { id: string; instellingen: LijnInstellingen; berichten: LijnBericht[] }[] } | null;
      const mijn = d?.actief?.find((a) => a.id === line.id);
      if (weg) return;
      if (!mijn) {
        setFout(t.mislukt);
        setBerichten([]);
        return;
      }
      setBerichten(mijn.berichten);
      setInst(mijn.instellingen);
    })();
    return () => {
      weg = true;
    };
  }, [scope, line.id, t.mislukt]);

  async function post(body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    setBezig(true);
    setFout("");
    setOk("");
    const r = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope, id: line.id, ...body }) }).catch(() => null);
    const d = (r ? await r.json().catch(() => ({})) : {}) as Record<string, unknown> & { error?: { message?: string } };
    setBezig(false);
    if (!r?.ok) {
      setFout(d.error?.message ?? t.mislukt);
      return null;
    }
    return d;
  }

  async function wis(id: string) {
    const d = await post({ action: "bericht-weg", bericht: id });
    if (d?.berichten) setBerichten(d.berichten as LijnBericht[]);
  }

  async function sms(e: FormEvent, aan: string) {
    e.preventDefault();
    const d = await post({ action: "sms", aan, tekst: smsTekst });
    if (d?.berichten) {
      setBerichten(d.berichten as LijnBericht[]);
      setSmsVoor(null);
      setSmsTekst("");
    }
  }

  async function bewaar(e: FormEvent) {
    e.preventDefault();
    if (!inst) return;
    const d = await post({ action: "instellingen", instellingen: inst });
    // de serverversie overnemen (die kort doorschakelnummers in zonder teamnummer, enz.)
    if (d?.instellingen) {
      setInst(d.instellingen as LijnInstellingen);
      setOk(t.opgeslagen);
    }
  }

  const maxNummers = opties.has("team") ? MAX_NUMMERS : 1;
  const zet = (patch: Partial<LijnInstellingen>) => setInst((i) => (i ? { ...i, ...patch } : i));

  return (
    <div className="mt-3 rounded-xl border border-hair bg-paper-soft/60 p-4">
      {line.number && <p className="text-xs text-neutralx-600">{t.koppelen}</p>}
      <div role="tablist" aria-label={line.number ?? line.id} className="mt-2 flex gap-1">
        {(["berichten", "instellingen"] as const).map((x) => (
          <button key={x} type="button" role="tab" aria-selected={tab === x} onClick={() => setTab(x)} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${tab === x ? "bg-white text-ink shadow-e1" : "text-neutralx-600"}`}>
            {x === "berichten" ? t.berichten : t.instellingen}
          </button>
        ))}
      </div>

      {fout && (
        <p role="alert" className="mt-3 text-sm font-semibold text-crit">
          {fout}
        </p>
      )}
      {ok && (
        <p role="status" className="mt-3 text-sm font-semibold text-ok">
          {ok}
        </p>
      )}

      {tab === "berichten" ? (
        <div className="mt-3">
          {berichten === null ? (
            <p className="text-sm text-neutralx-500">{t.laden}</p>
          ) : berichten.length === 0 ? (
            <p className="text-sm text-neutralx-500">{t.geenBerichten}</p>
          ) : (
            <ul className="space-y-2">
              {berichten.map((b) => (
                <li key={b.id} className="rounded-lg border border-hair bg-white p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-semibold text-ink">
                      {b.uit ? t.uitgaand : t.soort[b.soort]} · {nummerTekst(b.van)}
                      {b.naam && <span className="font-normal text-neutralx-600"> · {b.naam}</span>}
                    </p>
                    <span className="text-xs text-neutralx-500">{wanneer(b.op)}</span>
                  </div>
                  {b.tekst && <p className="mt-1 whitespace-pre-line text-sm text-neutralx-700">{b.tekst}</p>}
                  {b.opnameSid && (
                    // de tekst staat er hierboven uitgeschreven (Whisper); de opname zelf heeft geen ondertitels
                    // eslint-disable-next-line jsx-a11y/media-has-caption
                    <audio controls preload="none" className="mt-2 w-full" src={`${API}/opname?scope=${scope}&id=${line.id}&bericht=${b.id}`} />
                  )}
                  <div className="mt-2 flex flex-wrap gap-3 text-xs">
                    {/^\+\d{9,15}$/.test(b.van) && (
                      <a href={`tel:${b.van}`} className="font-semibold text-brand-700 underline">
                        {t.belTerug}
                      </a>
                    )}
                    {opties.has("sms") && /^\+\d{9,15}$/.test(b.van) && (
                      <button type="button" onClick={() => setSmsVoor(smsVoor === b.id ? null : b.id)} className="font-semibold text-brand-700 underline">
                        {t.smsTerug}
                      </button>
                    )}
                    <button type="button" onClick={() => void wis(b.id)} disabled={bezig} className="text-neutralx-500 underline hover:text-crit">
                      {t.verwijderen}
                    </button>
                  </div>
                  {smsVoor === b.id && (
                    <form onSubmit={(e) => void sms(e, b.van)} className="mt-2 flex flex-col gap-2 sm:flex-row">
                      <label className="sr-only" htmlFor={`sms-${b.id}`}>
                        {t.smsPlaatshouder}
                      </label>
                      <input id={`sms-${b.id}`} value={smsTekst} onChange={(e) => setSmsTekst(e.target.value)} maxLength={600} placeholder={t.smsPlaatshouder} className={veld} />
                      <button type="submit" disabled={bezig || !smsTekst.trim()} className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                        {bezig ? t.bezig : t.versturen}
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-[11px] text-neutralx-500">{t.bewaard}</p>
        </div>
      ) : !inst ? (
        <p className="mt-3 text-sm text-neutralx-500">{t.laden}</p>
      ) : (
        <form onSubmit={(e) => void bewaar(e)} className="mt-3 space-y-5">
          {!kanInstellen && <p className="text-sm text-neutralx-600">{t.alleenBeheerder}</p>}
          <fieldset disabled={!kanInstellen || bezig} className="space-y-5">
            <label className="block text-sm font-medium text-ink">
              {t.naam}
              <input value={inst.naam} onChange={(e) => zet({ naam: e.target.value })} maxLength={60} className={`mt-1 ${veld} sm:w-80`} />
              <span className="mt-0.5 block text-xs font-normal text-neutralx-500">{t.naamUitleg}</span>
            </label>

            {(opties.has("doorschakelen") || opties.has("team")) && (
              <div>
                <p className="text-sm font-medium text-ink">{t.doorschakelen}</p>
                <p className="text-xs text-neutralx-500">{opties.has("team") ? t.doorschakelenTeam : t.doorschakelenUitleg}</p>
                <ul className="mt-2 space-y-2">
                  {inst.doorschakelen.map((n, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <label className="sr-only" htmlFor={`door-${line.id}-${i}`}>
                        {t.doorschakelen} {i + 1}
                      </label>
                      <input id={`door-${line.id}-${i}`} value={n} inputMode="tel" onChange={(e) => zet({ doorschakelen: inst.doorschakelen.map((x, j) => (j === i ? e.target.value : x)) })} className={`${veld} sm:w-64`} />
                      <button type="button" onClick={() => zet({ doorschakelen: inst.doorschakelen.filter((_, j) => j !== i) })} className="text-xs text-neutralx-500 underline">
                        {t.weg}
                      </button>
                    </li>
                  ))}
                </ul>
                {inst.doorschakelen.length < maxNummers && (
                  <button type="button" onClick={() => zet({ doorschakelen: [...inst.doorschakelen, ""] })} className="mt-2 text-xs font-semibold text-brand-700 underline">
                    {t.nummerToevoegen}
                  </button>
                )}
                <label className="mt-3 block text-sm font-medium text-ink">
                  {t.belSeconden}
                  <select value={inst.belSeconden} onChange={(e) => zet({ belSeconden: Number(e.target.value) })} className={`mt-1 block ${veld} sm:w-48`}>
                    {BELTIJDEN.map((s) => (
                      <option key={s} value={s}>
                        {vulIn(t.seconden, { aantal: s })}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}

            <div>
              <p className="text-sm font-medium text-ink">{t.openingstijden}</p>
              <p className="text-xs text-neutralx-500">{t.openingstijdenUitleg}</p>
              <ul className="mt-2 space-y-1.5">
                {WEEKDAGEN.map((d) => {
                  const v = inst.openingstijden[d];
                  return (
                    <li key={d} className="flex flex-wrap items-center gap-2 text-sm">
                      <label className="flex w-36 items-center gap-2">
                        <input type="checkbox" checked={v !== null} onChange={(e) => zet({ openingstijden: { ...inst.openingstijden, [d]: e.target.checked ? { van: "09:00", tot: "17:00" } : null } })} className="h-4 w-4" />
                        {t.dagen[d]}
                      </label>
                      {v && (
                        <>
                          <label className="flex items-center gap-1 text-neutralx-600">
                            {t.van}
                            <input type="time" value={v.van} onChange={(e) => zet({ openingstijden: { ...inst.openingstijden, [d]: { ...v, van: e.target.value } } })} className="rounded-lg border border-hairstrong px-2 py-1" />
                          </label>
                          <label className="flex items-center gap-1 text-neutralx-600">
                            {t.tot}
                            <input type="time" value={v.tot} onChange={(e) => zet({ openingstijden: { ...inst.openingstijden, [d]: { ...v, tot: e.target.value } } })} className="rounded-lg border border-hairstrong px-2 py-1" />
                          </label>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>

            {opties.has("keuzemenu") && (
              <div>
                <p className="text-sm font-medium text-ink">{t.menu}</p>
                <p className="text-xs text-neutralx-500">{t.menuUitleg}</p>
                <ul className="mt-2 space-y-2">
                  {inst.menu.map((m, i) => (
                    <li key={i} className="flex flex-wrap items-center gap-2 text-sm">
                      <label className="flex items-center gap-1">
                        {t.toets}
                        <select value={m.toets} onChange={(e) => zet({ menu: inst.menu.map((x, j) => (j === i ? { ...x, toets: Number(e.target.value) } : x)) })} className="rounded-lg border border-hairstrong px-2 py-1">
                          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => (
                            <option key={k} value={k}>
                              {k}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="sr-only" htmlFor={`menu-label-${line.id}-${i}`}>
                        {t.menuLabel}
                      </label>
                      <input id={`menu-label-${line.id}-${i}`} value={m.label} placeholder={t.menuLabel} maxLength={40} onChange={(e) => zet({ menu: inst.menu.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} className="w-44 rounded-lg border border-hairstrong px-2 py-1" />
                      <label className="sr-only" htmlFor={`menu-naar-${line.id}-${i}`}>
                        {t.menuNaar}
                      </label>
                      <input id={`menu-naar-${line.id}-${i}`} value={m.naar[0] ?? ""} placeholder={t.menuNaar} inputMode="tel" onChange={(e) => zet({ menu: inst.menu.map((x, j) => (j === i ? { ...x, naar: [e.target.value, ...x.naar.slice(1)] } : x)) })} className="w-40 rounded-lg border border-hairstrong px-2 py-1" />
                      <button type="button" onClick={() => zet({ menu: inst.menu.filter((_, j) => j !== i) })} className="text-xs text-neutralx-500 underline">
                        {t.weg}
                      </button>
                    </li>
                  ))}
                </ul>
                {inst.menu.length < MAX_MENU && (
                  <button
                    type="button"
                    onClick={() => zet({ menu: [...inst.menu, { toets: [1, 2, 3, 4, 5, 6, 7, 8, 9].find((k) => !inst.menu.some((m) => m.toets === k)) ?? 9, label: "", naar: [""] }] })}
                    className="mt-2 text-xs font-semibold text-brand-700 underline"
                  >
                    {t.keuzeToevoegen}
                  </button>
                )}
              </div>
            )}

            {opties.has("opnemen") && (
              <label className="flex items-start gap-2 text-sm text-ink">
                <input type="checkbox" checked={inst.opnemen} onChange={(e) => zet({ opnemen: e.target.checked })} className="mt-0.5 h-4 w-4" />
                <span>
                  <span className="font-medium">{t.opnemen}</span>
                  <span className="block text-xs text-neutralx-500">{t.opnemenUitleg}</span>
                </span>
              </label>
            )}

            {kanInstellen && (
              <button type="submit" disabled={bezig} className="rounded-lg bg-ink px-5 py-2 text-sm font-bold text-white disabled:opacity-50">
                {bezig ? t.bezig : t.opslaan}
              </button>
            )}
          </fieldset>
        </form>
      )}
    </div>
  );
}
