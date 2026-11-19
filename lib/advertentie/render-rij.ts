// ---------------------------------------------------------------------------
// Een wachtrij voor het renderen van beelden (next/og kost rekentijd en geheugen):
// hooguit `max` renders tegelijk voor de hele app, de rest wacht op zijn beurt.
// Wie langer dan `wachtMs` moet wachten krijgt RijVol; de beeldroutes maken daar
// een 503 met Retry-After van (nooit een 403). Zo kan één bezoeker, of een
// script, de server niet vol zetten met renders. Puur (geen kv, geen prisma);
// de gedeelde rij staat op globalThis, omdat Next elke route apart bundelt.
// ---------------------------------------------------------------------------

export class RijVol extends Error {
  constructor() {
    super("Het is even druk met het maken van beelden.");
    this.name = "RijVol";
  }
}

export type Rij = <T>(taak: () => Promise<T>) => Promise<T>;

export function maakRij(max = 2, wachtMs = 8000): Rij {
  let bezig = 0;
  const wachtend: { door: () => void }[] = [];
  return async <T>(taak: () => Promise<T>): Promise<T> => {
    if (bezig >= max) {
      // wachten op een plek; wie klaar is, geeft zijn plek rechtstreeks door (bezig blijft dan gelijk)
      await new Promise<void>((door, weiger) => {
        const plek = { door: () => undefined as void };
        const klok = setTimeout(() => {
          const i = wachtend.indexOf(plek);
          if (i >= 0) wachtend.splice(i, 1);
          weiger(new RijVol());
        }, wachtMs);
        plek.door = () => {
          clearTimeout(klok);
          door();
        };
        wachtend.push(plek);
      });
    } else {
      bezig++;
    }
    try {
      return await taak();
    } finally {
      const volgende = wachtend.shift();
      if (volgende) volgende.door();
      else bezig--;
    }
  };
}

const g = globalThis as typeof globalThis & { __zfRenderRij?: Rij };
/** De ene rij voor alle beelden van de advertenties en de logo maker: twee tegelijk, hooguit acht seconden wachten. */
export const renderRij: Rij = (taak) => (g.__zfRenderRij ??= maakRij(2, 8000))(taak);
