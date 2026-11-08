import { PageHeader } from "@/components/app/ui";

export const metadata = { title: "Verzending" };
export const dynamic = "force-dynamic";

export default function HorecaVerzendingPage() {
  return (
    <>
      <PageHeader title="Bezorging" subtitle="Beheer bezorgingen en bezorgkosten" />
      <div className="card p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg border border-hair p-4">
            <p className="text-xs text-neutralx-600">Ingeschakeld</p>
            <p className="mt-2 font-semibold">Niet actief</p>
          </div>
          <div className="rounded-lg border border-hair p-4">
            <p className="text-xs text-neutralx-600">Bezorgkosten</p>
            <p className="mt-2 font-semibold">€0</p>
          </div>
        </div>
        <button className="btn-primary">Bezorging inschakelen</button>
      </div>
    </>
  );
}
