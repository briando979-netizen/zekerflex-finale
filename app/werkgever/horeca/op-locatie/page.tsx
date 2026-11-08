import { PageHeader } from "@/components/app/ui";

export const metadata = { title: "Op locatie" };
export const dynamic = "force-dynamic";

export default function HorecaOpLocatiePage() {
  return (
    <>
      <PageHeader title="Op locatie" subtitle="Tafelbeheer en bediening" />
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="card p-4 text-center">
            <p className="text-2xl font-bold">0</p>
            <p className="text-xs text-neutralx-600">Bezette tafels</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-2xl font-bold">0</p>
            <p className="text-xs text-neutralx-600">Klanten vandaag</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-2xl font-bold">€0</p>
            <p className="text-xs text-neutralx-600">Omzet vandaag</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-2xl font-bold">0</p>
            <p className="text-xs text-neutralx-600">Bestellingen</p>
          </div>
        </div>
        <div className="card p-6">
          <h3 className="font-semibold mb-4">Tafels</h3>
          <p className="text-sm text-neutralx-600">Geen tafels ingesteld</p>
          <button className="btn-primary mt-4">+ Tafel toevoegen</button>
        </div>
      </div>
    </>
  );
}
