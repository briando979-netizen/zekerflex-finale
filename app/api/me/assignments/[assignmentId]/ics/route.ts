import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Local wall-clock → floating iCalendar datetime (no timezone marker). */
function floating(d: Date): string {
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `T${pad(d.getHours())}${pad(d.getMinutes())}00`
  );
}

function escapeText(s: string): string {
  return s.replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
}

// GET /api/me/assignments/<assignmentId>/ics — the shift as a calendar file.
// Served inline so phones/laptops hand it straight to the calendar app; add
// ?dl=1 to force a download instead.
export async function GET(
  req: Request,
  { params }: { params: { assignmentId: string } },
): Promise<Response> {
  const principal = await requirePrincipal();
  const forceDownload = new URL(req.url).searchParams.get("dl") === "1";
  const profile = await prisma.freelancerProfile.findUnique({
    where: { userId: principal.userId },
    select: { id: true },
  });
  if (!profile) return new Response("Not found", { status: 404 });

  const assignment = await prisma.shiftAssignment.findFirst({
    where: { id: params.assignmentId, freelancerId: profile.id },
    select: {
      id: true,
      cancelledAt: true,
      shift: {
        select: {
          title: true,
          startsAt: true,
          endsAt: true,
          hourlyRateCents: true,
          breakMinutes: true,
          requiredSkill: { select: { name: true } },
          branch: {
            select: {
              name: true,
              addressLine: true,
              postalCode: true,
              city: true,
              latitude: true,
              longitude: true,
            },
          },
        },
      },
    },
  });
  if (!assignment) return new Response("Not found", { status: 404 });

  const s = assignment.shift;
  const b = s.branch;
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const address = `${b.name}, ${b.addressLine}, ${b.postalCode} ${b.city}`;
  const rate = `EUR ${(s.hourlyRateCents / 100).toFixed(2).replace(".", ",")}`;

  const description = [
    `Je klus via ZekerFlex bij ${b.name}.`,
    `Uurtarief: ${rate} per uur.`,
    s.requiredSkill ? `Functie: ${s.requiredSkill.name}.` : null,
    s.breakMinutes > 0 ? `Pauze: ${s.breakMinutes} minuten.` : "Geen pauze.",
    `Adres: ${b.addressLine}, ${b.postalCode} ${b.city}.`,
    "",
    "Bevestig je komst in de app en check op tijd in op locatie.",
  ]
    .filter((l): l is string => l !== null)
    .join("\n");

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ZekerFlex//Shift//NL",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:shift-${assignment.id}@zekerflex.com`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${floating(s.startsAt)}`,
    `DTEND:${floating(s.endsAt)}`,
    `SUMMARY:${escapeText(s.title)} — ${escapeText(b.name)}`,
    `DESCRIPTION:${escapeText(description)}`,
    `LOCATION:${escapeText(address)}`,
    b.latitude && b.longitude ? `GEO:${b.latitude};${b.longitude}` : null,
    "TRANSP:OPAQUE",
    assignment.cancelledAt ? "STATUS:CANCELLED" : "STATUS:CONFIRMED",
    "BEGIN:VALARM",
    "TRIGGER:-PT2H",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeText(`Over 2 uur begint je klus bij ${b.name}`)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ]
    .filter((l): l is string => l !== null)
    .join("\r\n");

  return new Response(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `${forceDownload ? "attachment" : "inline"}; filename="zekerflex-klus-${assignment.id}.ics"`,
      "Cache-Control": "no-store",
    },
  });
}
