import { SalesPartnerBusiness } from "@prisma/client";
import Link from "next/link";

interface PartnerBusinessTableProps {
  businesses: (SalesPartnerBusiness & {
    approvedBy?: { id: string; fullName: string; email: string } | null;
  })[];
  total: number;
  currentPage: number;
  totalPages: number;
}

export function PartnerBusinessTable({
  businesses,
  total,
  currentPage,
  totalPages,
}: PartnerBusinessTableProps) {
  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat("nl-NL", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(date);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "PENDING":
        return "bg-yellow-100 text-yellow-800";
      case "APPROVED":
        return "bg-green-100 text-green-800";
      case "REJECTED":
        return "bg-red-100 text-red-800";
      case "CONTACTED":
        return "bg-blue-100 text-blue-800";
      case "CONVERTED":
        return "bg-purple-100 text-purple-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      PENDING: "In behandeling",
      APPROVED: "Goedgekeurd",
      REJECTED: "Afgewezen",
      CONTACTED: "Gecontacteerd",
      CONVERTED: "Klant",
    };
    return labels[status] || status;
  };

  return (
    <div className="bg-white rounded shadow">
      <div className="px-6 py-4 border-b border-gray-200">
        <h3 className="font-semibold">Ingediende Bedrijven ({total})</h3>
      </div>

      {businesses.length === 0 ? (
        <div className="px-6 py-8 text-center text-gray-500">
          Nog geen bedrijven ingediend
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr className="border-b border-gray-200">
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">
                  Bedrijf
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">
                  Contactpersoon
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">
                  Ingediend
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700">
                  Goedgekeurd Op
                </th>
              </tr>
            </thead>
            <tbody>
              {businesses.map((business) => (
                <tr
                  key={business.id}
                  className="border-b border-gray-100 hover:bg-gray-50"
                >
                  <td className="px-6 py-4">
                    <div>
                      <p className="font-semibold text-sm">{business.businessName}</p>
                      {business.kvkNumber && (
                        <p className="text-xs text-gray-500">KvK: {business.kvkNumber}</p>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <div>
                      <p className="font-semibold">{business.contactName}</p>
                      <p className="text-xs text-gray-500">{business.contactEmail}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <span
                      className={`px-3 py-1 rounded text-xs font-semibold ${getStatusColor(
                        business.status
                      )}`}
                    >
                      {getStatusLabel(business.status)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    {formatDate(business.createdAt)}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    {business.approvedAt ? (
                      <div>
                        <p>{formatDate(business.approvedAt)}</p>
                        {business.rejectionReason && (
                          <p className="text-xs text-red-600 mt-1">
                            {business.rejectionReason}
                          </p>
                        )}
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="px-6 py-4 border-t border-gray-200 flex justify-center gap-2">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
            <Link
              key={page}
              href={`?page=${page}`}
              className={`px-3 py-1 rounded text-sm ${
                page === currentPage
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {page}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
