import { env } from "@/lib/env";
import { sendMail, mailShell, mailButton } from "@/lib/mail";
import { CONTACTS } from "@/lib/seo";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { amsterdamClock, amsterdamDayKey } from "@/lib/time/amsterdam";
import { lijstScans } from "@/lib/scans/store";
import { scanOverzicht, laatsteActiviteit } from "@/lib/scans/overzicht";
import { SOORT_LABEL, STATUS_INFO, statusVan, type ScanLog } from "@/lib/scans/model";

// ---------------------------------------------------------------------------
// Elke ochtend (cron 07:00 UTC, /api/internal/scans/dagoverzicht) één mail aan
// sales@: de gratis scans van gisteren, wie ja zei en wie nog op opvolging wacht,
// met een knop naar Admin → Scans & deals. Een interne melding: er gaat niets naar
// bedrijven. Geen mail als er niets gebeurde; hooguit één per dag (KV-merk).
// ---------------------------------------------------------------------------

const MERK = (dag: string) => `scan-dagoverzicht:${dag}`;
const MAX_REGELS = 15;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const wie = (l: ScanLog) => `${l.naam}${l.host && l.host !== l.naam ? ` (${l.host})` : ""}${l.plaats ? `, ${l.plaats}` : ""}`;
const regelNieuw = (l: ScanLog) => `${wie(l)} — ${SOORT_LABEL[l.soort].toLowerCase()}, score ${l.score}, ${STATUS_INFO[statusVan(l)].label.toLowerCase()}`;
const datum = (iso: string) => `${new Date(iso).toLocaleDateString("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "short" })} ${amsterdamClock(iso)}`;
// "Bel me eerst terug" (stap aanvraag met info "terugbellen, in de ochtend"): zet het moment erbij
const terugbellen = (l: ScanLog) => l.stappen.find((s) => s.stap === "aanvraag" && s.info?.startsWith("terugbellen"))?.info ?? null;
const regelWacht = (l: ScanLog) => `${wie(l)} — ${terugbellen(l) ?? STATUS_INFO[statusVan(l)].label.toLowerCase()}, laatst actief ${datum(laatsteActiviteit(l))}`;

export async function stuurScanDagoverzicht(nu = new Date()): Promise<{ ok: true; verstuurd: boolean; reden?: string; nieuw: number; akkoord: number; wachten: number }> {
  const dag = amsterdamDayKey(nu);
  const o = scanOverzicht(await lijstScans(2000), nu);
  const tellers = { nieuw: o.nieuw.length, akkoord: o.akkoord.length, wachten: o.wachten.length };
  if (!o.ietsNieuws) return { ok: true, verstuurd: false, reden: "niets nieuws", ...tellers };
  if (await kvGet(MERK(dag)).catch(() => null)) return { ok: true, verstuurd: false, reden: "vandaag al verstuurd", ...tellers };

  const base = env.APP_BASE_URL.replace(/\/+$/, "");
  const blokken: { kop: string; regels: string[]; meer: number }[] = [
    { kop: `Ja op het voorstel (${o.akkoord.length})`, regels: o.akkoord.slice(0, MAX_REGELS).map(regelNieuw), meer: Math.max(0, o.akkoord.length - MAX_REGELS) },
    { kop: `Wacht op opvolging (${o.wachten.length})`, regels: o.wachten.slice(0, MAX_REGELS).map(regelWacht), meer: Math.max(0, o.wachten.length - MAX_REGELS) },
    { kop: `Nieuwe scans (${o.nieuw.length})`, regels: o.nieuw.slice(0, MAX_REGELS).map(regelNieuw), meer: Math.max(0, o.nieuw.length - MAX_REGELS) },
  ].filter((b) => b.regels.length > 0);

  const onderwerp = [o.akkoord.length ? `${o.akkoord.length} akkoord` : "", o.wachten.length ? `${o.wachten.length} wacht op opvolging` : "", o.nieuw.length ? `${o.nieuw.length} nieuw` : ""].filter(Boolean).join(", ");
  const res = await sendMail({
    to: CONTACTS.sales,
    kind: "scan-dagoverzicht",
    subject: `Scans & deals: ${onderwerp}`,
    text: `Goedemorgen,\n\nZo staan de gratis scans ervoor.\n\n${blokken.map((b) => `${b.kop}\n${b.regels.map((r) => `- ${r}`).join("\n")}${b.meer ? `\n- en nog ${b.meer}` : ""}`).join("\n\n")}\n\nOpvolgen: ${base}/admin/scans\n\nZekerFlex`,
    html: mailShell(
      "Scans & deals van vandaag",
      `${blokken
        .map(
          (b) => `<p style="margin:0 0 6px;font-size:14px;color:#17211C"><strong>${esc(b.kop)}</strong></p>
       <ul style="margin:0 0 14px;padding-left:18px;font-size:14px;color:#3C4A42">${b.regels.map((r) => `<li style="margin:0 0 4px">${esc(r)}</li>`).join("")}${b.meer ? `<li style="margin:0 0 4px">en nog ${b.meer}</li>` : ""}</ul>`,
        )
        .join("")}
       <p style="margin:0">${mailButton(`${base}/admin/scans`, "Open Scans & deals")}</p>`,
    ),
  });
  if (res.error) return { ok: true, verstuurd: false, reden: `versturen mislukt: ${res.error}`.slice(0, 160), ...tellers };
  await kvSet(MERK(dag), { at: nu.toISOString(), ...tellers }).catch(() => undefined);
  return { ok: true, verstuurd: true, ...tellers };
}
