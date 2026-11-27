import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { PageHead } from "@/components/admin/kit";
import { KpiStrip } from "@/components/admin/kit-client";
import { Panel } from "@/components/admin/kit";
import { fetchPartnerKpis } from "./actions";
import Link from "next/link";

export const metadata = {
  title: "Sales Partner Dashboard",
};

export default async function PartnerDashboardPage() {
  const session = await getSession();
  if (!session?.user?.id) {
    redirect("/auth/login");
  }

  const kpis = await fetchPartnerKpis(session.user.id);

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat("nl-NL", {
      style: "currency",
      currency: "EUR",
    }).format(cents / 100);
  };

  return (
    <div className="space-y-6">
      <PageHead
        title="Partners Dashboard"
        subtitle="Volg je verdiensten en ingediende bedrijven"
      />

      <KpiStrip
        kpis={[
          {
            label: "Bedrijven ingediend",
            value: kpis.businessesSubmitted.toString(),
            icon: "📋",
          },
          {
            label: "Goedgekeurd",
            value: kpis.businessesApproved.toString(),
            icon: "✅",
          },
          {
            label: "Deze maand",
            value: formatCurrency(kpis.thisMonthEarnings),
            icon: "💰",
          },
          {
            label: "Totaal verdiensten",
            value: formatCurrency(kpis.totalEarnings),
            icon: "🏆",
          },
        ]}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Panel title="Welkom bij het Partner Programma" icon="👋">
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Als partner van ZekerFlex kun je nieuwe bedrijven aanbrengen en verdiensten opbouwen op basis van
              commissie.
            </p>

            <div className="space-y-2">
              <h4 className="font-semibold text-sm">Hoe het werkt:</h4>
              <ol className="list-decimal list-inside space-y-1 text-sm text-gray-600">
                <li>Dien bedrijven in die interesse hebben</li>
                <li>Wij beoordelen en keuren goed</li>
                <li>Jij verdient commissie per goedgekeurd bedrijf</li>
                <li>Betaling maandelijks</li>
              </ol>
            </div>

            {!kpis.isVerified && (
              <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
                <p className="text-sm text-yellow-800">
                  ⚠️ Je account is nog niet geverifieerd. Voltooi je profiel om bedrijven in te dienen.
                </p>
              </div>
            )}

            <div className="flex gap-2">
              <Link
                href="/werkgever/partners/bedrijven"
                className="inline-block bg-green-600 text-white px-4 py-2 rounded text-sm hover:bg-green-700"
              >
                Bedrijven indienen
              </Link>
              <Link
                href="/werkgever/partners/commissie"
                className="inline-block bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700"
              >
                Commissies bekijken
              </Link>
            </div>
          </div>
        </Panel>

        <Panel title="Status" icon="📊">
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Account Status</span>
              <span
                className={`text-sm font-semibold px-3 py-1 rounded ${
                  kpis.status === "ACTIVE"
                    ? "bg-green-100 text-green-800"
                    : "bg-yellow-100 text-yellow-800"
                }`}
              >
                {kpis.status === "ACTIVE" ? "Actief" : "In behandeling"}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Verificatie</span>
              <span
                className={`text-sm font-semibold px-3 py-1 rounded ${
                  kpis.isVerified
                    ? "bg-green-100 text-green-800"
                    : "bg-red-100 text-red-800"
                }`}
              >
                {kpis.isVerified ? "Geverifieerd" : "Niet geverifieerd"}
              </span>
            </div>

            <div className="pt-2 border-t">
              <Link
                href="/werkgever/partners/instellingen"
                className="text-sm text-blue-600 hover:underline"
              >
                Profiel beheren →
              </Link>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
