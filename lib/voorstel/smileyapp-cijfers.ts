import { lastDays } from "@/lib/sites/stats-shared";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import { somCijfers, type Cijfers } from "@/lib/voorstel/smileyapp-cijfer-regels";

// ---------------------------------------------------------------------------
// De tellers achter "Cijfers" in het SmileyApp-beheer (zie
// lib/voorstel/smileyapp-cijfer-regels.ts voor wat er telt). Eén Redis-hash per
// Nederlandse dag, voorstel-smileyapp:cijfers:<dag>:
//   v  weergaven · e  binnenkomsten van buiten · a  demo-aanvragen
//   p:<pad>  weergaven per pagina (alleen paden uit de vaste lijst)
// Niets per bezoeker: geen IP, geen cookie, geen referrer. Na 400 dagen vervalt
// een dag vanzelf. Redis pas laden als er geteld wordt (zoals lib/sites/stats.ts),
// zodat een test of pagina die dit bestand importeert geen verbinding opent.
// ---------------------------------------------------------------------------

const BEWAAR_SECONDEN = 400 * 86_400;
const sleutel = (dag: string) => `voorstel-smileyapp:cijfers:${dag}`;

/** Telt één weergave van `pad` (al gecontroleerd met telPad). `buiten`: de bezoeker kwam van buiten de site. */
export async function telWeergave(pad: string, buiten: boolean, nu = new Date()): Promise<void> {
  const { redis } = await import("@/lib/redis");
  const k = sleutel(amsterdamDayKey(nu));
  const m = redis.multi().hincrby(k, "v", 1).hincrby(k, `p:${pad}`, 1);
  if (buiten) m.hincrby(k, "e", 1);
  await m.expire(k, BEWAAR_SECONDEN).exec();
}

/** Telt één demo-aanvraag op de dag van vandaag. */
export async function telDemoAanvraag(nu = new Date()): Promise<void> {
  const { redis } = await import("@/lib/redis");
  const k = sleutel(amsterdamDayKey(nu));
  await redis.multi().hincrby(k, "a", 1).expire(k, BEWAAR_SECONDEN).exec();
}

/** De cijfers van de laatste `aantalDagen` Nederlandse dagen tot en met vandaag. */
export async function smileyappCijfers(aantalDagen = 30, nu = new Date()): Promise<Cijfers> {
  const { redis } = await import("@/lib/redis");
  const dagen = lastDays(aantalDagen, nu);
  const pipe = redis.pipeline();
  for (const dag of dagen) pipe.hgetall(sleutel(dag));
  const res = (await pipe.exec()) ?? [];
  return somCijfers(
    dagen,
    dagen.map((_, i) => {
      const [fout, hash] = res[i] ?? [null, null];
      return fout ? null : (hash as Record<string, string> | null);
    }),
  );
}
