import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { PageHead } from "@/components/admin/kit";
import { fetchPartnerBusinesses } from "../actions";
import { BusinessRegistrationForm } from "@/components/werkgever/BusinessRegistrationForm";
import { PartnerBusinessTable } from "@/components/werkgever/PartnerBusinessTable";

export const metadata = {
  title: "Bedrijven indienen",
};

export default async function BusinessesPage({
  searchParams,
}: {
  searchParams: { page?: string };
}) {
  const session = await getSession();
  if (!session?.user?.id) {
    redirect("/auth/login");
  }

  const page = parseInt(searchParams.page || "1");
  const { businesses, total, pages } = await fetchPartnerBusinesses(session.user.id, page);

  return (
    <div className="space-y-6">
      <PageHead
        title="Bedrijven indienen"
        subtitle="Voeg nieuwe bedrijven toe en volg je ingediende leads"
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <BusinessRegistrationForm userId={session.user.id} />
        </div>

        <div className="lg:col-span-2">
          <PartnerBusinessTable
            businesses={businesses}
            total={total}
            currentPage={page}
            totalPages={pages}
          />
        </div>
      </div>
    </div>
  );
}
