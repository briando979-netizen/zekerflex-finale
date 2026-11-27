import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { PageHead, Panel } from "@/components/admin/kit";
import { fetchPendingBusinessLeads } from "../actions";
import { BusinessLeadsQueue } from "@/components/admin/BusinessLeadsQueue";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const metadata = {
  title: "Bedrijfsleads beoordelen",
};

export default async function BusinessLeadsPage({
  searchParams,
}: {
  searchParams: { page?: string };
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
  const { leads, total, pages } = await fetchPendingBusinessLeads(page);

  return (
    <div className="space-y-6">
      <PageHead
        title="Bedrijfsleads beoordelen"
        subtitle="Goedkeuren of afwijzen van ingediende bedrijven"
      />

      <Panel title="Wachtrij" icon="⏳">
        {total} bedrijven wachten op beoordeling
      </Panel>

      <BusinessLeadsQueue
        leads={leads}
        currentPage={page}
        totalPages={pages}
        approverId={session.user.id}
      />
    </div>
  );
}
