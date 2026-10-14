import { NextResponse } from "next/server";
import { getPrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateSkillsPath } from "@/lib/skills/paths";

// GET /api/me/skills-path
// Returns a personalised AI-generated skills learning path for the authenticated freelancer.

export async function GET() {
  const principal = await getPrincipal();
  if (!principal) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  const profile = await prisma.freelancerProfile.findUnique({
    where: { userId: principal.userId },
    select: { id: true },
  });

  if (!profile) return NextResponse.json({ error: "Geen freelancer profiel gevonden" }, { status: 404 });

  const path = await generateSkillsPath(profile.id);
  return NextResponse.json(path);
}
