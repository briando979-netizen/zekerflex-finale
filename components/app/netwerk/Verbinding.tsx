"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { NietInIphone } from "@/components/app/NietInIphone";
import {
  MODULE_DEFS,
  MODULE_LIJST,
  STATUS_LABEL,
  euro,
  maandOverzicht,
  maandbedragCent,
  vpnOnbeperktVanaf,
  type ModuleSleutel,
  type ModuleStand,
  type NetwerkStand,
  type VpnVariant,
} from "@/lib/netwerk/modules";

// ---------------------------------------------------------------------------
// Werkgever → Wifi en VPN: de drie netwerkpakketten aanzetten, de wifi per
// vestiging instellen (IP, netwerknaam, het geheim voor de apparatuur) en
// VPN-toegangscodes maken. Alles via /api/werkgever/netwerk; de gegevens
// komen van de server (app/werkgever/netwerk/page.tsx).
// ---------------------------------------------------------------------------

export interface WifiVestigingData {
  branchId: string;
  ip: string;
  ssid: string;
  secret: string;
  aan: boolean;
  sinds: string;
}

export interface VerbindingData {
  stand: NetwerkStand;
  vestigingen: { id: string; naam: string; plaats: string; wifi: WifiVestigingData | null }[];
  wifiServer: { host: string; poort: number; klaar: boolean };
  vpn: {
    gekoppeld: boolean;
    adres: string | null;
    apparaten: { id: string; naam: string; online: boolean; laatstGezien: string | null; adressen: string[] }[];
    log: { userId: string; naam: string; at: string; verlooptAt: string }[];
  };
  mijnWifi: { gebruiker: string; wachtwoord: string } | null;
  /** kosteloos account: alles € 0 */
  free: boolean;
  magBeheren: boolean;
}

const PILL: Record<ModuleStand["status"], string> = {
  aangevraagd: "bg-plan-soft text-plan-ink",
  "wacht-op-betaling": "pill-warn",
  actief: "bg-mintwash text-ok",
  opgezegd: "bg-paper-soft text-neutralx-500",
};

const MAANDEN = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
/** Vast formaat in Nederlandse tijd (geen toLocale*: server en browser tonen hetzelfde). */
function datumNl(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const delen = new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }).formatToParts(d);
  const v = (t: string) => delen.find((p) => p.type === t)?.value ?? "";
  return `${v("day")} ${MAANDEN[Number(v("month")) - 1] ?? ""} ${v("year")}, ${v("hour")}:${v("minute")}`;
}

const VELD = "mt-1 block w-full rounded-lg border border-hairstrong px-3 py-2 text-sm";

async function roep(body: Record<string, unknown>): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const res = await fetch("/api/werkgever/netwerk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  const data = res ? ((await res.json().catch(() => ({}))) as Record<string, unknown>) : {};
  return { ok: Boolean(res?.ok), data };
}

const foutTekst = (data: Record<string, unknown>, anders: string): string => {
  const e = data.error as { message?: string } | undefined;
  return e?.message ?? anders;
};

function Kopieer({ tekst, label = "Kopieer" }: { tekst: string; label?: string }) {
  const [klaar, setKlaar] = useState(false);
  return (
    <button
      type="button"
      className="rounded-md border border-hairstrong px-2 py-1 text-xs font-semibold text-neutralx-600 hover:bg-paper-soft"
      onClick={() => {
        navigator.clipboard?.writeText(tekst).then(() => {
          setKlaar(true);
          setTimeout(() => setKlaar(false), 1500);
        });
      }}
    >
      {klaar ? "Gekopieerd" : label}
    </button>
  );
}

export function Verbinding({ data }: { data: VerbindingData }) {
  const router = useRouter();
  const [stand, setStand] = useState<NetwerkStand>(data.stand);
  const [vestigingen, setVestigingen] = useState(data.vestigingen);
  const [busy, setBusy] = useState<string>("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [vpnVariant, setVpnVariant] = useState<VpnVariant>("per-gebruiker");
  const [vpnAantal, setVpnAantal] = useState(5);
  const [terrein, setTerrein] = useState("");
  const [vpnUren, setVpnUren] = useState(24);
  const [vpnSleutel, setVpnSleutel] = useState<{ sleutel: string; verlooptAt: string; server: string | null } | null>(null);
  const [toonWw, setToonWw] = useState(false);

  // terug van het betaalscherm
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("betaald")) setDone("Bedankt. Zodra Stripe de betaling bevestigt (meestal binnen een minuut), staat het pakket aan. Ververs de pagina om het te zien.");
    if (q.get("geannuleerd")) setError("De betaling is niet afgerond. Je kunt het hieronder opnieuw proberen.");
  }, []);

  const overzicht = maandOverzicht(stand);
  const aantalVestigingen = Math.max(1, vestigingen.length);

  async function start(sleutel: ModuleSleutel) {
    setBusy(sleutel);
    setError("");
    setDone("");
    const body: Record<string, unknown> = { actie: "start", sleutel };
    if (sleutel === "wifi") body.aantal = aantalVestigingen;
    if (sleutel === "vpn") {
      body.variant = vpnVariant;
      body.aantal = vpnVariant === "onbeperkt" ? 1 : vpnAantal;
    }
    if (sleutel === "5g" && terrein.trim()) body.toelichting = terrein.trim();
    const { ok, data: r } = await roep(body);
    setBusy("");
    if (!ok) {
      setError(foutTekst(r, "Aanzetten lukte niet. Probeer het opnieuw."));
      return;
    }
    if (typeof r.checkoutUrl === "string") {
      window.location.assign(r.checkoutUrl);
      return;
    }
    if (r.stand) setStand(r.stand as NetwerkStand);
    setDone(typeof r.melding === "string" ? r.melding : "Gelukt.");
    router.refresh();
  }

  async function opzeggen(sleutel: ModuleSleutel) {
    if (!window.confirm(`${MODULE_DEFS[sleutel].naam} opzeggen?`)) return;
    setBusy(`op-${sleutel}`);
    setError("");
    setDone("");
    const { ok, data: r } = await roep({ actie: "opzeggen", sleutel });
    setBusy("");
    if (!ok) {
      setError(foutTekst(r, "Opzeggen lukte niet."));
      return;
    }
    if (r.stand) setStand(r.stand as NetwerkStand);
    setDone(typeof r.melding === "string" ? r.melding : "Opgezegd.");
    router.refresh();
  }

  async function wifiOpslaan(branchId: string, ip: string, ssid: string, aan: boolean) {
    setBusy(`wifi-${branchId}`);
    setError("");
    setDone("");
    const { ok, data: r } = await roep({ actie: "wifi-vestiging", branchId, ip, ssid, aan });
    setBusy("");
    if (!ok) {
      setError(foutTekst(r, "Opslaan lukte niet."));
      return;
    }
    const v = r.vestiging as WifiVestigingData;
    setVestigingen((l) => l.map((x) => (x.id === branchId ? { ...x, wifi: v } : x)));
    setDone("Opgeslagen. Zet het geheim hieronder in de wifi-apparatuur van deze vestiging.");
  }

  async function wifiWeg(branchId: string) {
    if (!window.confirm("De wifi-koppeling van deze vestiging verwijderen? De apparatuur daar kan dan niet meer bij onze server.")) return;
    setBusy(`wifi-${branchId}`);
    const { ok, data: r } = await roep({ actie: "wifi-weg", branchId });
    setBusy("");
    if (!ok) {
      setError(foutTekst(r, "Verwijderen lukte niet."));
      return;
    }
    setVestigingen((l) => l.map((x) => (x.id === branchId ? { ...x, wifi: null } : x)));
  }

  async function vpnCode() {
    setBusy("vpn-sleutel");
    setError("");
    setDone("");
    const { ok, data: r } = await roep({ actie: "vpn-sleutel", uren: vpnUren });
    setBusy("");
    if (!ok) {
      setError(foutTekst(r, "Kon geen toegangscode maken."));
      return;
    }
    setVpnSleutel({ sleutel: String(r.sleutel), verlooptAt: String(r.verlooptAt), server: typeof r.server === "string" ? r.server : null });
    router.refresh();
  }

  async function apparaatWeg(id: string, naam: string) {
    if (!window.confirm(`"${naam}" van het netwerk halen?`)) return;
    setBusy(`ap-${id}`);
    const { ok, data: r } = await roep({ actie: "vpn-apparaat-weg", id });
    setBusy("");
    if (!ok) {
      setError(foutTekst(r, "Verwijderen lukte niet."));
      return;
    }
    setDone("Het apparaat is van het netwerk gehaald.");
    router.refresh();
  }

  const wifiActief = stand.modules.wifi?.status === "actief";
  const vpnActief = stand.modules.vpn?.status === "actief";

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-ink">Wifi, VPN en eigen 5G</h1>
        <p className="mt-1 max-w-3xl text-sm text-neutralx-600">
          Netwerkpakketten die aan je rooster vastzitten: wifi die vanzelf aan- en uitgaat met een dienst, een veilige verbinding naar je eigen systemen, en een eigen
          mobiel netwerk op een terrein. Alles draait op de servers van ZekerFlex in Nederland, zonder diensten van derden.
        </p>
      </header>

      {error && (
        <p role="alert" className="rounded-xl border border-crit/30 bg-crit/5 px-4 py-3 text-sm font-semibold text-crit">
          {error}
        </p>
      )}
      {done && (
        <p role="status" className="rounded-xl border border-ok/30 bg-mintwash px-4 py-3 text-sm font-semibold text-ok">
          {done}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-5">
          {MODULE_LIJST.map((def) => {
            const m = stand.modules[def.sleutel];
            const status = m?.status;
            const leverbaar = def.sleutel === "wifi" ? data.wifiServer.klaar : def.sleutel === "vpn" ? data.vpn.gekoppeld : false;
            const kanStarten = !status || status === "opgezegd" || status === "wacht-op-betaling" || (status === "aangevraagd" && leverbaar && !def.opAanvraag);
            const bedrag =
              def.sleutel === "wifi"
                ? maandbedragCent("wifi", aantalVestigingen)
                : def.sleutel === "vpn"
                  ? maandbedragCent("vpn", vpnAantal, vpnVariant)
                  : def.prijsCent;
            return (
              <section key={def.sleutel} className="rounded-2xl border border-hair bg-white p-5 shadow-e1">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-ink">{def.naam}</h2>
                    <p className="text-xs text-neutralx-400">
                      {def.ookBekendAls} · {def.prijsTekst}
                    </p>
                  </div>
                  {status && <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${PILL[status]}`}>{STATUS_LABEL[status]}</span>}
                </div>
                <p className="mt-3 text-sm text-neutralx-600">{def.uitleg}</p>
                <ul className="mt-3 grid gap-1.5 text-sm text-neutralx-700 sm:grid-cols-2">
                  {def.punten.map((p) => (
                    <li key={p} className="flex gap-2">
                      <span className="mt-[3px] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-ok" aria-hidden />
                      {p}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-neutralx-500">
                  <span className="font-semibold text-neutralx-600">Voor wie:</span> {def.voorWie}
                  <br />
                  <span className="font-semibold text-neutralx-600">Wat je nodig hebt:</span> {def.nodig}
                </p>

                {m && (
                  <p className="mt-3 text-xs text-neutralx-500">
                    {STATUS_LABEL[m.status]} sinds {datumNl(m.sinds)}
                    {m.status === "actief" && m.gratis ? " · gratis voor jouw account" : ""}
                    {m.eindigtOp ? ` · opgezegd, loopt tot ${datumNl(m.eindigtOp).slice(0, -7)}` : ""}
                    {m.status === "aangevraagd" && def.opAanvraag ? " · we nemen contact met je op" : ""}
                    {m.status === "aangevraagd" && !def.opAanvraag && !leverbaar ? " · je krijgt bericht zodra het klaarstaat" : ""}
                  </p>
                )}

                {data.magBeheren && kanStarten && (
                  <div className="mt-4 rounded-xl bg-paper-soft p-4">
                    {def.sleutel === "wifi" && (
                      <p className="text-sm text-neutralx-700">
                        Voor {aantalVestigingen === 1 ? "jouw vestiging" : `jouw ${aantalVestigingen} vestigingen`}:{" "}
                        <strong className="text-ink">{data.free ? "€ 0" : euro(bedrag)} per maand</strong>
                        {data.free ? " (gratis voor jouw account)" : ""}.
                      </p>
                    )}
                    {def.sleutel === "vpn" && (
                      <div className="space-y-2 text-sm text-neutralx-700">
                        <label className="flex items-center gap-2">
                          <input type="radio" name="vpn-variant" checked={vpnVariant === "per-gebruiker"} onChange={() => setVpnVariant("per-gebruiker")} className="h-4 w-4" />
                          Per gebruiker ({euro(def.prijsCent)} per maand)
                        </label>
                        {vpnVariant === "per-gebruiker" && (
                          <label className="ml-6 block">
                            Aantal gebruikers
                            <input type="number" min={1} max={500} value={vpnAantal} onChange={(e) => setVpnAantal(Math.max(1, Math.min(500, Number(e.target.value) || 1)))} className={`${VELD} sm:w-32`} />
                          </label>
                        )}
                        <label className="flex items-center gap-2">
                          <input type="radio" name="vpn-variant" checked={vpnVariant === "onbeperkt"} onChange={() => setVpnVariant("onbeperkt")} className="h-4 w-4" />
                          Hele bedrijf, onbeperkt ({euro(def.onbeperktCent ?? 0)} per maand; voordeliger vanaf {vpnOnbeperktVanaf()} gebruikers)
                        </label>
                        <p>
                          <strong className="text-ink">{data.free ? "€ 0" : euro(bedrag)} per maand</strong>
                          {data.free ? " (gratis voor jouw account)" : ""}
                        </p>
                      </div>
                    )}
                    {def.sleutel === "5g" && (
                      <label className="block text-sm text-neutralx-700">
                        Vertel kort over het terrein (waar, hoe groot, wat er moet verbinden)
                        <textarea value={terrein} onChange={(e) => setTerrein(e.target.value)} rows={3} maxLength={2000} className={VELD} placeholder="Bijvoorbeeld: bouwplaats in Zwolle, 2 hectare, 40 handterminals en 12 camera's, vanaf maart." />
                      </label>
                    )}
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <NietInIphone melding>
                      <button type="button" className="btn-primary" disabled={busy === def.sleutel} onClick={() => start(def.sleutel)}>
                        {busy === def.sleutel
                          ? "Even geduld…"
                          : def.opAanvraag
                            ? "Vraag een gesprek aan"
                            : !leverbaar
                              ? "Zet me op de lijst"
                              : status === "wacht-op-betaling"
                                ? "Betaling afronden"
                                : data.free
                                  ? "Zet aan"
                                  : "Zet aan en betaal"}
                      </button>
                      </NietInIphone>
                      {!leverbaar && !def.opAanvraag && (
                        <span className="text-xs text-neutralx-500">We richten de server hiervoor in; aanmelden kost nog niets.</span>
                      )}
                    </div>
                  </div>
                )}
                {data.magBeheren && status === "actief" && !m?.eindigtOp && (
                  <div className="mt-4">
                    <button type="button" className="text-sm font-semibold text-neutralx-500 underline-offset-2 hover:underline" disabled={busy === `op-${def.sleutel}`} onClick={() => opzeggen(def.sleutel)}>
                      Opzeggen
                    </button>
                  </div>
                )}
              </section>
            );
          })}

          {/* ---- wifi instellen ---- */}
          {wifiActief && (
            <section className="rounded-2xl border border-hair bg-white p-5 shadow-e1">
              <h2 className="text-lg font-bold text-ink">Wifi instellen</h2>
              <p className="mt-1 text-sm text-neutralx-600">
                Zet in de instellingen van jullie wifi-apparatuur (router of accesspoints) per vestiging een netwerk met beveiliging <strong>WPA2/WPA3-Enterprise</strong>, en
                vul daar onze RADIUS-server in. Medewerkers en flexwerkers loggen dan in met hun e-mailadres en hun eigen wifi-wachtwoord uit ZekerFlex.
              </p>
              <dl className="mt-3 grid gap-2 rounded-xl bg-paper-soft p-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-neutralx-500">RADIUS-server</dt>
                  <dd className="mt-0.5 flex items-center gap-2 font-mono text-ink">
                    {data.wifiServer.host} <Kopieer tekst={data.wifiServer.host} />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-neutralx-500">Poort (UDP)</dt>
                  <dd className="mt-0.5 font-mono text-ink">{data.wifiServer.poort}</dd>
                </div>
              </dl>
              {!data.wifiServer.klaar && (
                <p role="status" className="mt-3 text-sm text-warn">
                  De RADIUS-server wordt nog ingericht; je kunt de vestigingen alvast invullen.
                </p>
              )}
              <div className="mt-4 space-y-4">
                {vestigingen.length === 0 && <p className="text-sm text-neutralx-500">Je hebt nog geen vestiging. Voeg er een toe via je bedrijfsprofiel.</p>}
                {vestigingen.map((v) => (
                  <WifiVestigingVak key={v.id} vestiging={v} busy={busy === `wifi-${v.id}`} magBeheren={data.magBeheren} onOpslaan={wifiOpslaan} onWeg={wifiWeg} />
                ))}
              </div>
              {data.mijnWifi && (
                <div className="mt-5 rounded-xl border border-hair p-4 text-sm">
                  <h3 className="font-semibold text-ink">Jouw eigen wifi-login</h3>
                  <p className="mt-1 text-neutralx-600">
                    Iedereen heeft een eigen login. Medewerkers en flexwerkers vinden die in hun ZekerFlex-app bij <strong>Account → Wifi</strong>.
                  </p>
                  <dl className="mt-2 grid gap-2 sm:grid-cols-2">
                    <div>
                      <dt className="text-xs text-neutralx-500">Gebruikersnaam</dt>
                      <dd className="font-mono text-ink">{data.mijnWifi.gebruiker}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-neutralx-500">Wachtwoord</dt>
                      <dd className="flex items-center gap-2 font-mono text-ink">
                        {toonWw ? data.mijnWifi.wachtwoord : "••••-••••-••••-••••"}
                        <button type="button" className="text-xs font-semibold text-brand-600" onClick={() => setToonWw((t) => !t)}>
                          {toonWw ? "Verberg" : "Toon"}
                        </button>
                        {toonWw && <Kopieer tekst={data.mijnWifi.wachtwoord} />}
                      </dd>
                    </div>
                  </dl>
                </div>
              )}
            </section>
          )}

          {/* ---- vpn ---- */}
          {vpnActief && (
            <section className="rounded-2xl border border-hair bg-white p-5 shadow-e1">
              <h2 className="text-lg font-bold text-ink">VPN: apparaten en toegangscodes</h2>
              {!data.vpn.gekoppeld ? (
                <p role="status" className="mt-2 text-sm text-warn">
                  De VPN-server wordt nog ingericht. Zodra hij klaarstaat, maak je hier toegangscodes.
                </p>
              ) : (
                <>
                  <p className="mt-1 text-sm text-neutralx-600">
                    Een toegangscode koppelt één apparaat aan jullie netwerk en werkt één keer. Installeer op het apparaat de gratis <strong>Tailscale</strong>-app, kies daarin
                    een eigen server en voer de code in.
                  </p>
                  {data.magBeheren && (
                    <div className="mt-3 flex flex-wrap items-end gap-3">
                      <label className="text-sm text-neutralx-700">
                        Geldig
                        <select value={vpnUren} onChange={(e) => setVpnUren(Number(e.target.value))} className={`${VELD} sm:w-40`}>
                          <option value={24}>24 uur</option>
                          <option value={72}>3 dagen</option>
                          <option value={168}>7 dagen</option>
                        </select>
                      </label>
                      <button type="button" className="btn-primary" disabled={busy === "vpn-sleutel"} onClick={vpnCode}>
                        {busy === "vpn-sleutel" ? "Even geduld…" : "Maak een toegangscode"}
                      </button>
                    </div>
                  )}
                  {vpnSleutel && (
                    <div className="mt-4 rounded-xl border border-ok/30 bg-mintwash p-4 text-sm" role="status">
                      <p className="font-semibold text-ink">Je toegangscode (wordt maar één keer getoond)</p>
                      <p className="mt-1 flex flex-wrap items-center gap-2 break-all font-mono text-ink">
                        {vpnSleutel.sleutel} <Kopieer tekst={vpnSleutel.sleutel} />
                      </p>
                      <p className="mt-2 text-neutralx-600">Geldig tot {datumNl(vpnSleutel.verlooptAt)}.</p>
                      <p className="mt-3 font-semibold text-ink">Op een computer (Windows, Mac, Linux):</p>
                      <pre className="mt-1 overflow-x-auto rounded-lg bg-ink px-3 py-2 text-xs text-white">{`tailscale up --login-server ${vpnSleutel.server ?? data.vpn.adres ?? ""} --auth-key ${vpnSleutel.sleutel}`}</pre>
                      <p className="mt-3 font-semibold text-ink">Op een telefoon (Android, iPhone):</p>
                      <p className="text-neutralx-600">
                        Open Tailscale, kies in het menu <em>Gebruik een eigen server</em> en vul <span className="font-mono">{vpnSleutel.server ?? data.vpn.adres}</span> in. Kies
                        daarna <em>Inloggen met toegangscode</em> en plak de code.
                      </p>
                    </div>
                  )}
                  <h3 className="mt-5 text-sm font-semibold text-ink">Verbonden apparaten</h3>
                  {data.vpn.apparaten.length === 0 ? (
                    <p className="mt-1 text-sm text-neutralx-500">Nog geen apparaten.</p>
                  ) : (
                    <ul className="mt-2 divide-y divide-hair text-sm">
                      {data.vpn.apparaten.map((a) => (
                        <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                          <div>
                            <span className="font-medium text-ink">{a.naam}</span>{" "}
                            <span className={`ml-1 rounded-full px-2 py-0.5 text-xs ${a.online ? "bg-mintwash text-ok" : "bg-paper-soft text-neutralx-500"}`}>{a.online ? "online" : "offline"}</span>
                            <span className="ml-2 font-mono text-xs text-neutralx-500">{a.adressen.join(", ")}</span>
                            {a.laatstGezien && <span className="ml-2 text-xs text-neutralx-400">laatst gezien {datumNl(a.laatstGezien)}</span>}
                          </div>
                          {data.magBeheren && (
                            <button type="button" className="text-xs font-semibold text-crit" disabled={busy === `ap-${a.id}`} onClick={() => apparaatWeg(a.id, a.naam)}>
                              Van het netwerk halen
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {data.vpn.log.length > 0 && (
                    <>
                      <h3 className="mt-5 text-sm font-semibold text-ink">Uitgegeven toegangscodes</h3>
                      <ul className="mt-1 text-xs text-neutralx-500">
                        {data.vpn.log.slice(0, 10).map((l) => (
                          <li key={`${l.userId}-${l.at}`}>
                            {l.naam} · {datumNl(l.at)} · geldig tot {datumNl(l.verlooptAt)}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </>
              )}
            </section>
          )}
        </div>

        {/* ---- maandoverzicht ---- */}
        <aside className="rounded-2xl border border-money/30 bg-money-soft/60 p-5 lg:sticky lg:top-4 lg:self-start">
          <h2 className="text-sm font-bold uppercase tracking-wide text-money-ink">Per maand</h2>
          {overzicht.regels.length === 0 ? (
            <p className="mt-2 text-sm text-neutralx-600">Nog geen pakket aan.</p>
          ) : (
            <ul className="mt-2 space-y-1.5 text-sm">
              {overzicht.regels.map((r) => (
                <li key={r.sleutel} className="flex justify-between gap-3">
                  <span className="text-neutralx-700">
                    {r.naam} <span className="text-neutralx-400">({r.omschrijving})</span>
                  </span>
                  <span className="font-semibold text-ink">{euro(r.bedragCent)}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex justify-between border-t border-money/30 pt-3 text-sm">
            <span className="font-semibold text-ink">Totaal</span>
            <span className="text-lg font-bold text-money-ink">{euro(overzicht.totaalCent)}</span>
          </div>
          <p className="mt-2 text-xs text-neutralx-500">Exclusief btw. Maandelijks opzegbaar; het loopt dan tot het einde van de betaalde periode.</p>
        </aside>
      </div>
    </div>
  );
}

function WifiVestigingVak({
  vestiging,
  busy,
  magBeheren,
  onOpslaan,
  onWeg,
}: {
  vestiging: VerbindingData["vestigingen"][number];
  busy: boolean;
  magBeheren: boolean;
  onOpslaan: (branchId: string, ip: string, ssid: string, aan: boolean) => Promise<void>;
  onWeg: (branchId: string) => Promise<void>;
}) {
  const [ip, setIp] = useState(vestiging.wifi?.ip ?? "");
  const [ssid, setSsid] = useState(vestiging.wifi?.ssid ?? "");
  const [aan, setAan] = useState(vestiging.wifi?.aan ?? true);
  const [toonGeheim, setToonGeheim] = useState(false);
  const w = vestiging.wifi;
  return (
    <div className="rounded-xl border border-hair p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-ink">
          {vestiging.naam} <span className="font-normal text-neutralx-400">· {vestiging.plaats}</span>
        </h3>
        {w ? <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${w.aan ? "bg-mintwash text-ok" : "bg-paper-soft text-neutralx-500"}`}>{w.aan ? "wifi aan" : "wifi uit"}</span> : <span className="text-xs text-neutralx-400">nog niet ingesteld</span>}
      </div>
      {magBeheren && (
        <form
          className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            void onOpslaan(vestiging.id, ip, ssid, aan);
          }}
        >
          <label className="text-sm text-neutralx-700">
            Vast IP-adres van de internetverbinding
            <input value={ip} onChange={(e) => setIp(e.target.value)} placeholder="83.12.45.67" required className={VELD} />
          </label>
          <label className="text-sm text-neutralx-700">
            Netwerknaam (SSID)
            <input value={ssid} onChange={(e) => setSsid(e.target.value)} placeholder="Bakkerij Jansen Werk" required maxLength={32} className={VELD} />
          </label>
          <div className="flex items-end gap-3">
            <label className="flex items-center gap-2 pb-2 text-sm text-neutralx-700">
              <input type="checkbox" checked={aan} onChange={(e) => setAan(e.target.checked)} className="h-4 w-4" /> aan
            </label>
            <button type="submit" className="btn-primary mb-0.5" disabled={busy}>
              {busy ? "…" : "Opslaan"}
            </button>
          </div>
        </form>
      )}
      {w && (
        <div className="mt-3 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutralx-500">Geheim voor de wifi-apparatuur (RADIUS shared secret)</p>
          <p className="mt-1 flex flex-wrap items-center gap-2 break-all font-mono text-ink">
            {toonGeheim ? w.secret : "••••••••••••••••••••••••••••••••"}
            <button type="button" className="text-xs font-semibold text-brand-600" onClick={() => setToonGeheim((t) => !t)}>
              {toonGeheim ? "Verberg" : "Toon"}
            </button>
            {toonGeheim && <Kopieer tekst={w.secret} />}
          </p>
          {magBeheren && (
            <button type="button" className="mt-2 text-xs font-semibold text-crit" disabled={busy} onClick={() => onWeg(vestiging.id)}>
              Koppeling verwijderen
            </button>
          )}
        </div>
      )}
    </div>
  );
}
