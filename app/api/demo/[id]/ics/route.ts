import { getDemoRequest } from "@/lib/demo/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Local wall-clock → iCalendar datetime (floating, no Z). */
function dt(date: string, time: string): string {
  const [h, m] = time.split(":");
  return `${date.replace(/-/g, "")}T${pad(Number(h))}${pad(Number(m))}00`;
}

function addMinutes(date: string, time: string, mins: number): string {
  const d = new Date(`${date}T${time}:00`);
  d.setMinutes(d.getMinutes() + mins);
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
}

// GET /api/demo/<id>/ics — the demo as a calendar file.
export async function GET(_req: Request, { params }: { params: { id: string } }): Promise<Response> {
  const rec = await getDemoRequest(params.id);
  if (!rec) return new Response("Not found", { status: 404 });

  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ZekerFlex//Demo//NL",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:demo-${rec.id}@zekerflex.com`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${dt(rec.date, rec.time)}`,
    `DTEND:${addMinutes(rec.date, rec.time, 30)}`,
    "SUMMARY:Demo ZekerFlex",
    `DESCRIPTION:Rondleiding door het ZekerFlex-platform voor ${rec.company}. Je ontvangt vooraf een videolink per e-mail.`,
    "LOCATION:Online",
    "STATUS:TENTATIVE",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");

  return new Response(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="zekerflex-demo-${rec.id}.ics"`,
    },
  });
}
