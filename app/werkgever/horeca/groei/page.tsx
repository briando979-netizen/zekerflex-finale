import { PageHeader } from "@/components/app/ui";

export const metadata = { title: "Groei" };
export const dynamic = "force-dynamic";

export default function HorecaGroeiPage() {
  return (
    <>
      <PageHeader title="Groei & Marketing" subtitle="Verhoog omzet en aantrekken klanten" />
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <div className="card p-4">
            <p className="text-xs text-neutralx-600">Groei deze maand</p>
            <p className="mt-2 text-2xl font-bold">0%</p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-neutralx-600">Doelgroepen</p>
            <p className="mt-2 text-2xl font-bold">0</p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-neutralx-600">Promoties</p>
            <p className="mt-2 text-2xl font-bold">0</p>
          </div>
        </div>
        <div className="card p-6">
          <button className="btn-primary">+ Nieuwe promotie</button>
        </div>
      </div>
    </>
  );
}
