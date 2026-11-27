import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { PageHead } from "@/components/admin/kit";
import { Panel } from "@/components/admin/kit";
import { prisma } from "@/lib/prisma";
import { ExportCommissionButton } from "@/components/werkgever/ExportCommissionButton";

export const metadata = {
  title: "Commissies",
};

export default async function CommissionPage() {
  const session = await getSession();
  if (!session?.user?.id) {
    redirect("/auth/login");
  }

  const commissions = await prisma.salesPartnerCommission.findMany({
    where: { partnerId: session.user.id },
    orderBy: { periodStart: "desc" },
  });

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat("nl-NL", {
      style: "currency",
      currency: "EUR",
    }).format(cents / 100);
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat("nl-NL").format(date);
  };

  const totalEarned = commissions
    .filter((c) => c.status === "paid")
    .reduce((sum, c) => sum + c.netAmountCents, 0);

  const totalPending = commissions
    .filter((c) => c.status === "pending")
    .reduce((sum, c) => sum + c.netAmountCents, 0);

  return (
    <div className="space-y-6">
      <PageHead
        title="Commissieoverzicht"
        subtitle="Je verdiensten per maand"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Panel title="Totaal Verdiensten" icon="💰">
          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-600">Betaald</p>
              <p className="text-2xl font-bold text-green-600">
                {formatCurrency(totalEarned)}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">In behandeling</p>
              <p className="text-2xl font-bold text-yellow-600">
                {formatCurrency(totalPending)}
              </p>
            </div>
          </div>
        </Panel>

        <Panel title="Export" icon="📊">
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Download je commissiegegevens als CSV voor boekhouding.
            </p>
            <ExportCommissionButton userId={session.user.id} />
          </div>
        </Panel>
      </div>

      <div className="bg-white rounded shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="font-semibold">Commissies</h3>
        </div>

        {commissions.length === 0 ? (
          <div className="px-6 py-8 text-center text-gray-500">
            Nog geen commissies gegenereerd
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr className="border-b border-gray-200">
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">
                    Periode
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">
                    Bruto
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">
                    Netto
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">
                    Betaald Op
                  </th>
                </tr>
              </thead>
              <tbody>
                {commissions.map((commission) => (
                  <tr key={commission.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm">
                      {formatDate(commission.periodStart)} tot{" "}
                      {formatDate(commission.periodEnd)}
                    </td>
                    <td className="px-6 py-4 text-sm font-semibold">
                      {formatCurrency(commission.amountCents)}
                    </td>
                    <td className="px-6 py-4 text-sm font-semibold text-green-600">
                      {formatCurrency(commission.netAmountCents)}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span
                        className={`px-3 py-1 rounded text-xs font-semibold ${
                          commission.status === "paid"
                            ? "bg-green-100 text-green-800"
                            : commission.status === "approved"
                            ? "bg-blue-100 text-blue-800"
                            : "bg-yellow-100 text-yellow-800"
                        }`}
                      >
                        {commission.status === "paid"
                          ? "Betaald"
                          : commission.status === "approved"
                          ? "Goedgekeurd"
                          : "In behandeling"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {commission.paidAt ? formatDate(commission.paidAt) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
