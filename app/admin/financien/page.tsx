import { getPrincipal, hasRole } from "@/lib/auth";
import { APageHeader } from "@/components/admin/ui";
import { FinanceConsole } from "@/components/admin/FinanceConsole";

export const dynamic = "force-dynamic";

export default async function AdminFinancienPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <APageHeader title="Geen toegang" subtitle="Financiën is alleen voor platformbeheer." />;
  }
  return (
    <>
      <APageHeader
        title="Financiën & winst"
        subtitle="Je echte omzet en marge, losgetrokken van doorlopende posten, met btw-positie, kosten, reserveringen en wat je eruit kunt halen."
      />
      <div className="mt-4">
        <FinanceConsole />
      </div>
    </>
  );
}
