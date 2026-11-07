import { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { OefenKlusAanmeldForm } from "@/components/horeca/oefenklus/OefenKlusAanmeldForm";

export const metadata: Metadata = { title: "Oefenklussen Horeca" };

async function getActieveOefenklussen() {
  return prisma.oefenKlus.findMany({
    where: {
      actief: true,
      datum: { gte: new Date() },
    },
    include: {
      zaak: { select: { naam: true, plaats: true } },
      aanmeldingen: {
        where: { status: { in: ["AANGEMELD", "GEACCEPTEERD"] } },
        select: { id: true },
      },
    },
    orderBy: { datum: "asc" },
  });
}

export default async function OefenKlussenPage() {
  const klussen = await getActieveOefenklussen();
  const formatDatum = (datum: Date) => datum.toLocaleDateString("nl-NL", { weekday: "long", day: "2-digit", month: "long" });

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Oefenklussen Horeca</h1>
          <p className="text-lg text-gray-600">Leer praktische vaardigheden bij professionele horecabedrijven. Geen ervaring nodig!</p>
        </div>

        {klussen.length === 0 ? (
          <div className="rounded-lg bg-gray-50 border border-gray-200 p-8 text-center">
            <p className="text-gray-600">Er zijn momenteel geen oefenklussen beschikbaar. Kom later terug!</p>
          </div>
        ) : (
          <div className="grid gap-6">
            {klussen.map((klus) => (
              <div key={klus.id} className="rounded-lg border border-gray-200 bg-white shadow-sm hover:shadow-md transition-shadow overflow-hidden">
                <div className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h2 className="text-2xl font-bold text-gray-900">{klus.titel}</h2>
                      <p className="text-gray-600 mt-1">{klus.zaak.naam}</p>
                      {klus.zaak.plaats && <p className="text-sm text-gray-500">{klus.zaak.plaats}</p>}
                    </div>
                    <div className="text-right">
                      <div className="inline-block px-3 py-1 rounded-full text-sm font-semibold">
                        {klus.niveau === "beginner" && <span className="bg-green-100 text-green-800">Beginner</span>}
                        {klus.niveau === "intermediate" && <span className="bg-blue-100 text-blue-800">Intermediate</span>}
                        {klus.niveau === "advanced" && <span className="bg-purple-100 text-purple-800">Gevorderd</span>}
                      </div>
                    </div>
                  </div>

                  <p className="text-gray-700 mb-4">{klus.beschrijving}</p>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 text-sm">
                    <div className="bg-gray-50 rounded p-3">
                      <p className="text-gray-600">Datum</p>
                      <p className="font-semibold text-gray-900">{formatDatum(klus.datum)}</p>
                    </div>
                    <div className="bg-gray-50 rounded p-3">
                      <p className="text-gray-600">Tijd</p>
                      <p className="font-semibold text-gray-900">{klus.startTijd.slice(0, 5)}</p>
                    </div>
                    <div className="bg-gray-50 rounded p-3">
                      <p className="text-gray-600">Plaatsen beschikbaar</p>
                      <p className="font-semibold text-gray-900">{klus.maxAanmeldingen - klus.aanmeldingen.length}</p>
                    </div>
                    <div className="bg-gray-50 rounded p-3">
                      <p className="text-gray-600">Moeilijkheid</p>
                      <p className="font-semibold text-gray-900 capitalize">{klus.niveau}</p>
                    </div>
                  </div>

                  <div className="border-t pt-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Meld je aan</h3>
                    <OefenKlusAanmeldForm oefenKlusId={klus.id} zaakNaam={klus.zaak.naam} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
