import { NextResponse } from "next/server";
import { getPrincipal } from "@/lib/auth";
import { transcribeAudio } from "@/lib/asr/transcribe";

// POST /api/me/voice
// Accepts a multipart audio upload, returns transcript.
// Used by the voice interface in the freelancer/employer dashboard.

export async function POST(req: Request) {
  const principal = await getPrincipal();
  if (!principal) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("audio");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Geen audio-bestand aangeleverd (veld: audio)" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await transcribeAudio(buffer, file.name, { language: "nl" });

  return NextResponse.json(result);
}
