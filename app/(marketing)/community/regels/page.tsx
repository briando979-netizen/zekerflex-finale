import type { Metadata } from "next";
import Link from "next/link";
import { LegalSection } from "@/components/marketing/LegalPage";
import { canonical } from "@/lib/seo";
import { GRENZEN } from "@/lib/community/regels";

// De huisregels van de community (22 nov 2026) en hoe melden werkt: de meldknop die de Digital Services Act vraagt, wat we
// met een melding doen, binnen welke tijd, en hoe je bezwaar maakt. Zie ook /dsa voor de contactpunten.

const TITLE = "Huisregels van de ZekerFlex community";
const DESCRIPTION = "De huisregels van de ZekerFlex community: respectvol, geen reclame, geen privégegevens. En hoe je een bericht meldt en wat wij daarmee doen.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  ...canonical("/community/regels", { title: TITLE, description: DESCRIPTION }),
};

export default function CommunityRegelsPage() {
  return (
    <>
      <div className="hero-ink text-white">
        <div className="shell py-16 md:py-20">
          <Link href="/community" className="text-sm font-medium text-white/60 hover:text-white">
            ← Community
          </Link>
          <p className="eyebrow mt-6 text-brand-mint">Community</p>
          <h1 className="mt-3 max-w-2xl break-words font-display text-3xl font-bold leading-tight md:text-4xl">Huisregels en melden</h1>
          <p className="mt-5 max-w-2xl text-lg text-white/70">
            De community is van iedereen die met ZekerFlex werkt. Met een paar korte afspraken blijft het een fijne plek om vragen te stellen en
            elkaar te helpen.
          </p>
        </div>
      </div>
      <section className="bg-paper">
        <div className="shell py-14 md:py-16">
          <div className="max-w-2xl space-y-8 text-[0.975rem] leading-relaxed text-ink-soft">
            <LegalSection
              heading="1. De huisregels"
              list={[
                "Wees respectvol. Je mag het oneens zijn, maar val nooit iemand persoonlijk aan. Geen schelden, discriminatie of bedreiging.",
                "Geen reclame of werving voor andere diensten. Een klus of dienst plaats je gewoon in de app van ZekerFlex.",
                "Geen privégegevens, van jezelf of van een ander: geen telefoonnummer, adres, e-mailadres, rekeningnummer of BSN. Ook geen foto van een ID-bewijs, loonstrook of contract.",
                "Alleen foto's die je zelf mag delen. Zet niemand herkenbaar op de foto zonder dat die persoon het goedvindt.",
                "Niets wat niet mag volgens de wet, en geen oplichting of nepaanbiedingen.",
                "Zie je iets wat niet klopt? Meld het. Dat helpt iedereen.",
              ]}
            />
            <LegalSection
              heading="2. Wie mag meedoen"
              body={`Lezen kan iedereen, ook zonder account. Een onderwerp starten, reageren, foto's delen en "Handig" geven kan met een gratis ZekerFlex-account, als werker of als bedrijf. Een nieuw account kan na ${GRENZEN.accountMinuten} minuten meedoen. Per dag kun je ${GRENZEN.onderwerpenPerDag} onderwerpen starten en ${GRENZEN.reactiesPerDag} keer reageren, met hooguit ${GRENZEN.links} links per bericht. Zo houden we spam buiten.`}
            />
            <LegalSection
              heading="3. Wat anderen van je zien"
              body="Bij je bericht staan je voornaam, de eerste letter van je achternaam, je profielfoto (als je die hebt) en of je werker of bedrijf bent. Nooit je volledige achternaam, e-mailadres of telefoonnummer. Uit elke foto halen we de locatie en andere verborgen gegevens voordat hij online komt. Je eigen bericht kun je altijd zelf verwijderen. Verwijder je je account, dan gaan je berichten mee: je reacties verdwijnen, en bij een onderwerp waarop anderen reageerden blijft alleen de titel staan, zonder jouw tekst, foto's en naam."
            />
            <LegalSection
              heading="4. Een bericht melden"
              body="Onder elk bericht staat de knop Melden. Die werkt voor iedereen, ook zonder account. Kies een reden (spam, beledigend, oplichting, privégegevens of iets anders) en vertel er eventueel kort bij wat er mis is. Je kunt een bericht ook melden via support@zekerflex.com; zet dan het adres van het bericht erbij."
            />
            <LegalSection
              heading="5. Wat wij met een melding doen"
              list={[
                "Elke melding komt direct bij het ZekerFlex-team binnen.",
                "Melden drie verschillende mensen hetzelfde bericht, dan verdwijnt het vanzelf tot wij het hebben bekeken.",
                "We bekijken meldingen zo snel mogelijk, meestal binnen twee werkdagen. Dan laten we het bericht staan, verbergen we het of verwijderen we het.",
                "Verbergen of verwijderen we een bericht, dan ziet de schrijver bij dat bericht waarom.",
                "Wie de regels steeds overtreedt, kan na een waarschuwing worden uitgesloten van de community. Lezen kan dan nog wel.",
              ]}
            />
            <LegalSection
              heading="6. Niet eens met een besluit?"
              body="Is jouw bericht verborgen of verwijderd, of ben je uitgesloten, en vind je dat onterecht? Mail support@zekerflex.com, binnen zes maanden. We kijken er dan opnieuw naar, met iemand die het eerste besluit niet nam als dat kan. Je kunt een geschil ook voorleggen aan een erkende geschilleninstantie in de EU of aan de rechter."
            />
            <p>
              Meer over onze plichten onder de Digital Services Act en de contactpunten:{" "}
              <Link href="/dsa" className="font-semibold text-ink underline underline-offset-4">
                Digital Services Act-informatie
              </Link>
              . Hoe we met je gegevens omgaan:{" "}
              <Link href="/privacy" className="font-semibold text-ink underline underline-offset-4">
                privacyverklaring
              </Link>
              .
            </p>
          </div>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link href="/community" className="btn-primary">
              Naar de community
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
