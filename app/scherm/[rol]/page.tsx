import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppError } from "@/lib/errors";
import { SCHERMEN, isSchermRol } from "@/lib/horeca/schermen";
import { schermContext, type SchermContext } from "@/lib/horeca/scherm-server";
import { SchermApp } from "@/components/horeca/scherm/SchermApp";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ rol: string }> }): Promise<Metadata> {
  const rol = (await params).rol;
  return { title: isSchermRol(rol) ? SCHERMEN[rol].naam : "Scherm" };
}

// Eén scherm (/scherm/keuken, /scherm/bediening, …). Alleen voor een apparaat
// dat als dit scherm gekoppeld is, of voor de beheerder van de zaak; anders
// terug naar /scherm om te koppelen.
export default async function SchermRolPagina({ params }: { params: Promise<{ rol: string }> }) {
  const rol = (await params).rol;
  if (!isSchermRol(rol)) notFound();
  let ctx: SchermContext | null = null;
  let moduleUit: string | null = null;
  try {
    ctx = await schermContext(rol);
  } catch (e) {
    if (e instanceof AppError && e.code === "PRECONDITION_FAILED") moduleUit = e.message;
  }
  if (moduleUit) {
    return (
      <main className="mx-auto grid min-h-[100dvh] max-w-md place-items-center p-6 text-center">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">{SCHERMEN[rol].naam}</h1>
          <p className="mt-2 text-[#B8C4BD]">{moduleUit}</p>
          <Link href="/werkgever/horeca?tab=modules" className="mt-5 inline-block rounded-full bg-white px-5 py-3 font-semibold text-[#0B0F0D]">
            Naar Modules
          </Link>
        </div>
      </main>
    );
  }
  if (!ctx) redirect("/scherm?kies");
  return <SchermApp rol={rol} zaakNaam={ctx.zaak.naam} apparaatNaam={ctx.apparaat?.naam ?? null} />;
}
