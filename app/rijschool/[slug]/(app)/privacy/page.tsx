import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { laadRijschool } from "@/lib/rijschool/pagina";
import { adresRegels, telefoonWeergave } from "@/lib/rijschool/format";
import { aiVerwerker, assistentAan } from "@/lib/rijschool/assistent-server";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const r = await laadRijschool((await params).slug);
  return { title: "Privacy", description: r ? `Hoe ${r.naam} omgaat met je gegevens in de app en op de website.` : "" };
}

// De privacyverklaring van de app en website van een rijschool. Google Play
// vraagt een openbaar adres; dit staat in de app-schermen, dus het werkt ook
// als de website zelf (nog) niet online staat.
export default async function PrivacyPage({ params }: { params: Promise<{ slug: string }> }) {
  const r = await laadRijschool((await params).slug);
  if (!r) notFound();
  const contact = [r.email, r.telefoon ? telefoonWeergave(r.telefoon) : ""].filter(Boolean).join(" of ");
  const adres = r.adres ? adresRegels(r.adres, r.plaats).join(", ") : "";
  const assistent = await assistentAan(r.id).catch(() => false);
  const kop = "mt-6 font-display text-lg font-bold text-ink";
  const tekst = "mt-2 text-sm leading-relaxed text-neutralx-700";
  return (
    <article className="card p-5 sm:p-7">
      <h1 className="font-display text-2xl font-bold text-ink">Privacyverklaring</h1>
      <p className={tekst}>
        Deze verklaring gaat over de app en de website van {r.naam}
        {r.plaats ? ` in ${r.plaats}` : ""}. {r.naam} is verantwoordelijk voor je gegevens. ZekerFlex levert de techniek en verwerkt je gegevens alleen in opdracht
        van {r.naam}.
      </p>

      <h2 className={kop}>Welke gegevens</h2>
      <ul className={`${tekst} list-disc space-y-1 pl-5`}>
        <li>Je naam, e-mailadres, telefoonnummer en, als je die opgeeft, je ophaaladres en geboortedatum.</li>
        <li>Je lessen: wanneer, met welke instructeur en auto, en of de les doorging.</li>
        <li>
          De route van een les, als je instructeur die opneemt: alleen tijdens de les, met de telefoon van de instructeur, als grove lijn (op ongeveer 10 meter). Alleen jij, je
          instructeur en {r.naam} zien hem. Na 2 jaar wordt de route gewist.
        </li>
        <li>Je voortgang: de beoordeling per onderdeel en de opmerkingen van je instructeur.</li>
        <li>De berichten die je in de app met {r.naam} uitwisselt. Na 2 jaar worden ze gewist.</li>
        <li>Je tegoed en betalingen voor lessen en pakketten.</li>
        <li>Je oefenresultaten bij theorie oefenen.</li>
        <li>Een versleuteld wachtwoord en een cookie die je ingelogd houdt.</li>
      </ul>

      <h2 className={kop}>Waarvoor</h2>
      <p className={tekst}>
        Om je rijopleiding te plannen en bij te houden, je lessen te bevestigen en je te herinneren, en je voortgang en tegoed te laten zien. We gebruiken je gegevens niet voor
        reclame en verkopen ze niet. Er zitten geen advertenties of volgcodes van derden in de app.
      </p>

      {assistent && (
        <>
          <h2 className={kop}>De assistent op de website</h2>
          <p className={tekst}>
            Stel je een vraag aan de assistent op de website (&quot;Stel een vraag&quot;), dan maakt {aiVerwerker()} het antwoord, alleen met de openbare gegevens van {r.naam}.
            Je vraag en het antwoord worden niet bewaard. Deel er geen persoonlijke gegevens in; voor een afspraak of iets persoonlijks neem je contact op met {r.naam}.
          </p>
        </>
      )}

      <h2 className={kop}>Wie ze ziet</h2>
      <p className={tekst}>
        Alleen {r.naam} en je instructeur. ZekerFlex bewaart de gegevens op eigen servers in Europa en deelt ze niet met anderen, behalve als de wet dat verplicht. Mails
        worden verstuurd via de mailserver van ZekerFlex.
      </p>

      <h2 className={kop}>Hoe lang</h2>
      <p className={tekst}>
        Zolang je les hebt en daarna zolang de wet dat vraagt (betalingen 7 jaar voor de belastingdienst). Daarna worden je gegevens verwijderd.
      </p>

      <h2 className={kop}>Je rechten en je account verwijderen</h2>
      <p className={tekst}>
        Je mag je gegevens inzien, laten verbeteren of laten verwijderen, ook je hele account. Vraag het aan {r.naam}
        {contact ? ` via ${contact}` : ""}. Binnen een maand krijg je antwoord. Ben je het er niet mee eens, dan kun je een klacht indienen bij de Autoriteit Persoonsgegevens.
      </p>

      <h2 className={kop}>Contact</h2>
      <p className={tekst}>
        {r.naam}
        {adres ? `, ${adres}` : ""}
        {r.kvk ? `, KVK ${r.kvk}` : ""}
        {contact ? `. ${contact}.` : "."}
      </p>
    </article>
  );
}
