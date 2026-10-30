import { publicOpenShifts, type PublicShift } from "@/lib/public-shifts";
import { isTenantVerified } from "@/lib/company/verified";
import { prisma } from "@/lib/prisma";
import { SITE } from "@/lib/seo";

export const revalidate = 1800;

// ---------------------------------------------------------------------------
// GET /vacatures.xml — every open klus as a job feed in the Indeed XML format,
// which Jooble, Adzuna, Careerjet and most Dutch aggregators also read. Free
// extra reach: submit the URL once at each job board (see owner todo
// "vacaturefeed"). Test klussen of not-yet-verified companies are left out.
// ---------------------------------------------------------------------------

const esc = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);
const cdata = (s: string) => `<![CDATA[${s.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
const eur = (c: number) => (c / 100).toFixed(2).replace(".", ",");
const TZ = "Europe/Amsterdam";

function description(s: PublicShift): string {
  const day = s.startsAt.toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long", timeZone: TZ });
  const from = s.startsAt.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
  const to = s.endsAt.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
  return [
    s.description ? `<p>${esc(s.description)}</p>` : "",
    `<p><strong>Wanneer:</strong> ${day}, ${from}–${to}<br><strong>Waar:</strong> ${esc(s.city)} (${esc(s.postalCode)})<br><strong>Tarief:</strong> € ${eur(s.hourlyRateCents)} per uur${s.positions > 1 ? `<br><strong>Plekken:</strong> ${s.positions}` : ""}</p>`,
    s.viaUitzendbureau
      ? "<p>Je werkt via het ZekerFlex-uitzendbureau: geen KVK nodig, wekelijks loon met vakantiegeld en pensioen (StiPP).</p>"
      : "<p>Voor zzp'ers en flexwerkers (KVK of EU-btw-nummer), of zonder KVK via het ZekerFlex-uitzendbureau. Je stuurt geen facturen en kiest zelf hoe snel je wordt uitbetaald.</p>",
    `<p>Reageren gaat via ZekerFlex: gratis account, binnen een paar minuten geverifieerd.</p>`,
  ].join("");
}

export async function GET(): Promise<Response> {
  const shifts = await publicOpenShifts({ take: 500 }).catch(() => [] as PublicShift[]);
  const tenantOf = new Map(
    (await prisma.shift.findMany({ where: { id: { in: shifts.map((s) => s.id) } }, select: { id: true, branch: { select: { tenantId: true } } } }).catch(() => [] as { id: string; branch: { tenantId: string } }[])).map((r) => [r.id, r.branch.tenantId]),
  );
  const verified = new Map<string, boolean>();
  const tenantIds = [...new Set(tenantOf.values())];
  for (let start = 0; start < tenantIds.length; start += 20) {
    const batch = tenantIds.slice(start, start + 20);
    const results = await Promise.all(batch.map(async (tenantId) => ({ tenantId, ok: await isTenantVerified(tenantId) })));
    for (const result of results) verified.set(result.tenantId, result.ok);
  }

  const rows: string[] = [];
  for (const s of shifts) {
    const t = tenantOf.get(s.id);
    if (!t) continue;
    if (!verified.get(t)) continue;
    const url = `${SITE.url}/klussen/${s.id}`;
    rows.push(`  <job>
    <title>${cdata(s.title)}</title>
    <date>${cdata(s.createdAt.toUTCString())}</date>
    <referencenumber>${cdata(s.id)}</referencenumber>
    <url>${cdata(`${url}?utm_source=jobfeed&utm_medium=xml`)}</url>
    <company>${cdata(s.company)}</company>
    <sourcename>${cdata("ZekerFlex")}</sourcename>
    <city>${cdata(s.city)}</city>
    <postalcode>${cdata(s.postalCode)}</postalcode>
    <country>${cdata("NL")}</country>
    <description>${cdata(description(s))}</description>
    <salary>${cdata(`€ ${eur(s.hourlyRateCents)} per uur`)}</salary>
    <jobtype>${cdata(s.viaUitzendbureau ? "temporary" : "contract, temporary")}</jobtype>
    <category>${cdata(s.skill ?? "Flexwerk")}</category>
    <expirationdate>${cdata(s.startsAt.toUTCString())}</expirationdate>
  </job>`);
  }
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<source>
  <publisher>ZekerFlex</publisher>
  <publisherurl>${esc(SITE.url)}</publisherurl>
  <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${rows.join("\n")}
</source>
`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=900, s-maxage=1800" } });
}
