import Link from "next/link";
import { BASE } from "@/lib/voorstel/smileyapp";
import { Gezicht } from "@/components/voorstel/smileyapp/Gezicht";

// Een adres binnen het voorstel dat niet bestaat: een smiley die even niet lacht.
export default function SmileyappNietGevonden() {
  return (
    <section className="mx-auto flex max-w-[720px] flex-col items-center px-4 py-24 text-center sm:px-8">
      <Gezicht score={2} className="h-36 w-36" />
      <h1 className="mt-8 font-display text-4xl font-bold">Deze pagina bestaat niet</h1>
      <p className="mt-3 text-lg text-smiley-mute">Misschien is het adres verkeerd getypt. Op de voorpagina vind je alles over Smileyapp.</p>
      <Link href={BASE} className="mt-8 rounded-full bg-smiley-ink px-7 py-4 font-bold text-white">
        Naar de voorpagina
      </Link>
    </section>
  );
}
