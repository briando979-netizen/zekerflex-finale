import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHeader } from "@/components/app/ui";
import { OwnerTodos } from "@/components/admin/OwnerTodos";

export const dynamic = "force-dynamic";

export default async function TeDoenPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHeader title="Geen toegang" subtitle="Alleen voor platformbeheerders." />;
  }
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Te doen voor jou" subtitle="Wat alleen jij kunt regelen (accounts, betaalgegevens, juridische check) — klik een taak open voor de stappen." />
      <OwnerTodos />
    </div>
  );
}
