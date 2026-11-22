import { onderwerpPad, type Bericht, type Melding, type Onderwerp, type Reactie, type ReactieLijst } from "@/lib/community/regels";
import { alleRijen, leesGebruikerIndex, onderwerpSleutel, uitsluitingVan, wijzig, wisGebruikerSleutels } from "@/lib/community/store";
import { wisFotos } from "@/lib/community/fotos";

// ---------------------------------------------------------------------------
// De community en de AVG (lib/privacy/anonymize.ts en export.ts). Bij inzage: al je onderwerpen en reacties, ook verborgen
// of verwijderde, en hoe vaak je iets handig vond of meldde. Bij wissen:
//   - een reactie van jou: weg (tekst en foto's), er staat alleen nog "verwijderd";
//   - een onderwerp van jou zonder reacties van anderen: weg;
//   - een onderwerp van jou met reacties van anderen: de titel blijft (anders hangen hun antwoorden in de lucht), je tekst en
//     foto's gaan weg en de schrijver heet "Verwijderd account";
//   - je naam gaat uit "Handig" en uit de meldingen die je deed; je losse foto's en je uitsluiting gaan weg.
// We lopen alle berichten langs (niet alleen je eigen lijst): die kan achterlopen, en het wissen moet volledig zijn.
// ---------------------------------------------------------------------------

const GEWIST_ONDERWERP = "Dit onderwerp is gestart door een account dat inmiddels is verwijderd.";

/** Haalt de gebruiker uit "Handig" en uit de meldingen (een melding blijft tellen, maar zonder wie hem deed). */
function zonderPersoon(b: Bericht, userId: string): Bericht {
  const handig = b.handig.filter((h) => h !== userId);
  const meldingen = b.meldingen.map((m): Melding => (m.door === `u:${userId}` ? { ...m, door: `gewist:${m.id}` } : m));
  return { ...b, handig, meldingen };
}

/** Wist alles van deze gebruiker uit de community. Geeft het aantal eigen berichten dat weg of anoniem is. */
export async function wisCommunityVan(userId: string): Promise<number> {
  if (!userId) return 0;
  const { onderwerpen, reacties } = await alleRijen();
  const index = await leesGebruikerIndex(userId);
  const fotos: string[] = (index?.losseFotos ?? []).map((f) => f.id);
  let eigen = 0;
  /** per onderwerp: staan er reacties van anderen onder (die niet verwijderd zijn)? */
  const metAnderen = new Set<string>();

  for (const { key, value } of reacties) {
    const lijst = value;
    if (lijst.reacties.some((r) => r.auteurId !== userId && r.status !== "verwijderd")) metAnderen.add(lijst.onderwerpId);
    const raakt = lijst.reacties.some((r) => r.auteurId === userId || r.handig.includes(userId) || r.meldingen.some((m) => m.door === `u:${userId}`));
    if (!raakt) continue;
    for (const r of lijst.reacties) {
      if (r.auteurId !== userId) continue;
      eigen += 1;
      fotos.push(...r.fotos);
    }
    await wijzig<ReactieLijst>(key, null, (l) => ({
      ...l,
      reacties: l.reacties.map((r): Reactie => {
        const bericht = zonderPersoon(r, userId);
        if (r.auteurId !== userId) return bericht;
        fotos.push(...r.fotos);
        return { ...bericht, auteurId: null, gewist: true, status: "verwijderd", tekst: "", fotos: [] };
      }),
    }));
  }

  for (const { key, value } of onderwerpen) {
    const raakt = value.auteurId === userId || value.handig.includes(userId) || value.meldingen.some((m) => m.door === `u:${userId}`);
    if (!raakt) continue;
    if (value.auteurId === userId) eigen += 1;
    await wijzig<Onderwerp>(key, null, (o) => {
      const bericht = zonderPersoon(o, userId);
      if (o.auteurId !== userId) return { ...o, ...bericht };
      fotos.push(...o.fotos);
      if (metAnderen.has(o.id)) return { ...o, ...bericht, auteurId: null, gewist: true, tekst: GEWIST_ONDERWERP, fotos: [] };
      return { ...o, ...bericht, auteurId: null, gewist: true, status: "verwijderd", titel: "Verwijderd onderwerp", tekst: "", fotos: [] };
    });
  }

  // het aantal zichtbare reacties klopt weer na het weghalen van de eigen reacties
  for (const { value } of reacties) {
    const eigenZichtbaar = value.reacties.filter((r) => r.auteurId === userId && r.status === "zichtbaar").length;
    if (eigenZichtbaar === 0) continue;
    await wijzig<Onderwerp>(onderwerpSleutel(value.onderwerpId), null, (o) => ({
      ...o,
      aantalReacties: Math.max(0, o.aantalReacties - eigenZichtbaar),
    })).catch(() => undefined);
  }

  await wisFotos([...new Set(fotos)]);
  await wisGebruikerSleutels(userId);
  return eigen;
}

/** Inzage (AVG art. 15/20): wat deze gebruiker in de community schreef en deed. */
export async function exportCommunityVan(userId: string): Promise<Record<string, unknown>> {
  const { onderwerpen, reacties } = await alleRijen();
  const eigenOnderwerpen = onderwerpen
    .map((r) => r.value)
    .filter((o) => o.auteurId === userId)
    .map((o) => ({ adres: onderwerpPad(o), titel: o.titel, tekst: o.tekst, categorie: o.categorie, geplaatst: o.at, status: o.status, fotos: o.fotos.length }));
  const eigenReacties = reacties.flatMap((r) =>
    r.value.reacties
      .filter((x) => x.auteurId === userId)
      .map((x) => ({ onderwerp: r.value.onderwerpId, tekst: x.tekst, geplaatst: x.at, status: x.status, fotos: x.fotos.length })),
  );
  const alleBerichten: Bericht[] = [...onderwerpen.map((r) => r.value), ...reacties.flatMap((r) => r.value.reacties)];
  const uitsluiting = await uitsluitingVan(userId).catch(() => null);
  return {
    onderwerpen: eigenOnderwerpen,
    reacties: eigenReacties,
    handigGegeven: alleBerichten.filter((b) => b.handig.includes(userId)).length,
    meldingenGedaan: alleBerichten.reduce((n, b) => n + b.meldingen.filter((m) => m.door === `u:${userId}`).length, 0),
    uitgesloten: uitsluiting ? { sinds: uitsluiting.at, reden: uitsluiting.reden } : null,
  };
}
