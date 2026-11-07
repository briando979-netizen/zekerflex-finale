import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";

export const dynamic = "force-dynamic";

interface ChecklistItem {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  link?: string;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const scope = await resolveEmployerScope(principal);
    const tenantId = scope.tenantIds[0];

    if (!tenantId) {
      throw AppError.precondition("Geen organisatie gekoppeld");
    }

    const [tenant, branches, teamMembers, shifts] = await Promise.all([
      prisma.tenant.findUnique({
        where: { id: tenantId },
        select: {
          name: true,
          kvkNumber: true,
        },
      }),
      prisma.branch.count({ where: { tenantId } }),
      prisma.membership.count({ where: { tenantId } }),
      prisma.shift.count({ where: { branch: { tenantId } } }),
    ]);

    const checklist: ChecklistItem[] = [
      {
        id: "profile",
        title: "Bedrijfsprofiel ingevuld",
        description: "Naam, logo en beschrijving van je bedrijf",
        completed: !!tenant?.name,
        link: "/werkgever/bedrijf",
      },
      {
        id: "kvk",
        title: "KVK-nummer geverifieerd",
        description: "Compliance en verificatie",
        completed: !!tenant?.kvkNumber,
        link: "/werkgever/compliance",
      },
      {
        id: "locations",
        title: "Minimaal één locatie aangemaakt",
        description: "Waar de flexwerkers werken",
        completed: branches > 0,
        link: "/werkgever/diensten",
      },
      {
        id: "team",
        title: "Team uitgenodigd",
        description: "Collega's met toegang",
        completed: teamMembers > 1,
        link: "/werkgever/team",
      },
      {
        id: "first_shift",
        title: "Eerste klus geplaatst",
        description: "Zoeken naar flexkrachten",
        completed: shifts > 0,
        link: "/werkgever/diensten/nieuw",
      },
    ];

    const completionPercentage = (checklist.filter((item) => item.completed).length / checklist.length) * 100;

    return NextResponse.json({
      checklist,
      completionPercentage: Math.round(completionPercentage),
      completedItems: checklist.filter((item) => item.completed).length,
      totalItems: checklist.length,
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
