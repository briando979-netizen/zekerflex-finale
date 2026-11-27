import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { PageHead, Panel } from "@/components/admin/kit";
import { generateMonthlyCommissionCSV } from "../actions";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const metadata = {
  title: "Commissies Exporteren",
};

export default async function CommissionExportPage() {
  const session = await getSession();
  if (!session?.user?.id) {
    redirect("/auth/login");
  }

  const membership = await prisma.membership.findFirst({
    where: {
      userId: session.user.id,
      role: UserRole.PLATFORM_ADMIN,
    },
  });

  if (!membership) {
    redirect("/werkgever");
  }

  return (
    <div className="space-y-6">
      <PageHead
        title="Commissies Exporteren"
        subtitle="Genereer maandelijkse commissie rapporten"
      />

      <Panel title="Maandelijkse Export" icon="📊">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Selecteer een maand en exporteer alle commissies voor die periode als CSV.
          </p>

          <div className="bg-blue-50 border border-blue-200 rounded p-4">
            <p className="text-sm text-blue-800">
              Deze pagina genereert een CSV-bestand met alle commissies voor de geselecteerde periode.
              Het bestand kan direct in je boekhoudsoftware worden geïmporteerd.
            </p>
          </div>

          <div className="mt-6">
            <p className="text-sm text-gray-600 mb-2">
              Deze functionaliteit wordt binnenkort beschikbaar gemaakt.
            </p>
          </div>
        </div>
      </Panel>
    </div>
  );
}
