import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { PageHead, KpiStrip } from "@/components/admin/kit";
import { fetchAllPartners } from "./actions";
import Link from "next/link";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const metadata = {
  title: "Sales Partners - Admin",
};

export default async function AdminPartnersPage({
  searchParams,
}: {
  searchParams: { status?: string; page?: string };
}) {
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

  const page = parseInt(searchParams.page || "1");
  const { partners, total, pages } = await fetchAllPartners(
    searchParams.status,
    page
  );

  const stats = await Promise.all([
    prisma.salesPartnerProfile.count({ where: { status: "ACTIVE" } }),
    prisma.salesPartnerBusiness.count({ where: { status: "PENDING" } }),
    prisma.salesPartnerBusiness.count({ where: { status: "APPROVED" } }),
  ]);

  return (
    <div className="space-y-6">
      <PageHead
        title="Sales Partners"
        subtitle="Beheer partners en hun commissies"
      />

      <KpiStrip
        kpis={[
          {
            label: "Actieve Partners",
            value: stats[0].toString(),
            icon: "👥",
          },
          {
            label: "Bedrijven in wachtrij",
            value: stats[1].toString(),
            icon: "⏳",
          },
          {
            label: "Goedgekeurd",
            value: stats[2].toString(),
            icon: "✅",
          },
        ]}
      />

      <div className="bg-white rounded shadow">
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <h3 className="font-semibold">Partners</h3>
          <div className="flex gap-2">
            <Link
              href="/admin/partners/bedrijfsleads"
              className="text-sm bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            >
              Bedrijfsleads beoordelen
            </Link>
            <Link
              href="/admin/partners/commissie-export"
              className="text-sm bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
            >
              Commissies exporteren
            </Link>
          </div>
        </div>

        {partners.length === 0 ? (
          <div className="px-6 py-8 text-center text-gray-500">
            Geen partners gevonden
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr className="border-b border-gray-200">
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">
                    Partner
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">
                    Bedrijven
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">
                    Commissie Model
                  </th>
                </tr>
              </thead>
              <tbody>
                {partners.map((partner) => (
                  <tr
                    key={partner.id}
                    className="border-b border-gray-100 hover:bg-gray-50"
                  >
                    <td className="px-6 py-4 text-sm font-semibold">
                      {partner.user.fullName}
                    </td>
                    <td className="px-6 py-4 text-sm">{partner.user.email}</td>
                    <td className="px-6 py-4 text-sm">
                      {partner.businessesApproved}/{partner.businessesSubmitted}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span
                        className={`px-3 py-1 rounded text-xs font-semibold ${
                          partner.status === "ACTIVE"
                            ? "bg-green-100 text-green-800"
                            : partner.status === "PENDING"
                            ? "bg-yellow-100 text-yellow-800"
                            : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {partner.status === "ACTIVE"
                          ? "Actief"
                          : partner.status === "PENDING"
                          ? "In behandeling"
                          : "Inactief"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {partner.commissionModel === "model_a"
                        ? `${partner.commissionRate}%`
                        : "Vaste Fee"}
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
