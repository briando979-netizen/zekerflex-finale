import { PageHeader } from "@/components/app/ui";

export const metadata = { title: "Kortingen" };
export const dynamic = "force-dynamic";

export default function HorecaKortingenPage() {
  return (
    <>
      <PageHeader title="Kortingen & Aanbiedingen" subtitle="Beheer kortingen en speciale aanbiedingen" />
      <div className="card p-6 space-y-4">
        <button className="btn-primary">+ Nieuwe korting</button>
        <div className="border-t border-hair pt-4">
          <p className="text-sm text-neutralx-600">Geen kortingen ingesteld</p>
        </div>
      </div>
    </>
  );
}
