import { getPrincipal, hasRole } from "@/lib/auth";
import { revenueByMonth } from "@/lib/admin/insights/money";
import { PageHead, Panel } from "@/components/admin/kit";
import { Chart } from "@/components/admin/kit-client";
import { FinanceConsole } from "@/components/admin/FinanceConsole";

export const dynamic = "force-dynamic";

export default async function AdminFinancienPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="Financiën is alleen voor platformbeheer." />;
  }
  const months = await revenueByMonth();
  return (
    <FinanceConsole
      chart={
        <Panel title="Eigen omzet per maand" subtitle="De laatste 12 maanden, per bron">
          <Chart
            title="Eigen omzet per maand en per bron"
            kind="bars"
            unit="money"
            labels={months.labels}
            series={[
              { label: "Platformkosten", values: months.platformfee, slot: 1 },
              { label: "Uitzendopslag", values: months.uitzend, slot: 2 },
              { label: "Webshop", values: months.shop, slot: 3 },
            ]}
            height={230}
            emptyText="Nog geen omzet in de laatste 12 maanden."
          />
        </Panel>
      }
    />
  );
}
