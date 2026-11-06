import { NextResponse } from "next/server";
import sharp from "sharp";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { jsonError } from "@/lib/http/errors";
import { geminiBeeld } from "@/lib/ai/gemini-media";
import { LIMIET_PER_DAG, LIMIET_PER_IP, PAS_FOUTEN, pasFotoPrompt, pasFotoSchema, type PasProduct } from "@/lib/shop/pas-foto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// POST /api/shop/pas-foto — de foto van de klant + gekozen shopproducten →
// dezelfde persoon, gekleed in die producten (beeldmodel). Niets wordt bewaard
// en de foto komt niet in een log. Alleen met uitdrukkelijke toestemming (akkoord),
// met een limiet per IP en een dagplafond voor de hele shop.

/** Productfoto van de eigen site ophalen (alleen paden van de site zelf, geen vrije adressen) en verkleinen. */
async function productFoto(imageUrl: string | null): Promise<{ b64: string; mime: string } | null> {
  if (!imageUrl || !imageUrl.startsWith("/") || imageUrl.startsWith("//")) return null;
  try {
    const res = await fetch(`${env.APP_BASE_URL.replace(/\/+$/, "")}${imageUrl}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 6_000_000) return null;
    const jpg = await sharp(buf).rotate().resize(768, 768, { fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 85 }).toBuffer();
    return { b64: jpg.toString("base64"), mime: "image/jpeg" };
  } catch {
    return null;
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const ip = clientIp(request);
    await enforceRateLimit({ name: "shop-pasfoto", identifier: ip, limit: LIMIET_PER_IP, windowSeconds: 600, message: PAS_FOUTEN.druk });
    const json = await request.json().catch(() => {
      throw AppError.validation("Body moet JSON zijn");
    });
    const parsed = pasFotoSchema.safeParse(json);
    if (!parsed.success) throw AppError.validation("Kies een foto, minstens één product en geef toestemming.", parsed.error.flatten());
    const d = parsed.data;
    await enforceRateLimit({ name: "shop-pasfoto-dag", identifier: "alle", limit: LIMIET_PER_DAG, windowSeconds: 86_400, message: PAS_FOUTEN.dagLimiet });

    const rows = await prisma.shopProduct.findMany({
      where: { id: { in: d.producten.map((p) => p.id) }, active: true },
      select: { id: true, name: true, category: true, description: true, imageUrl: true },
    });
    const perId = new Map(rows.map((r) => [r.id, r]));
    const gekozen = d.producten.map((p) => ({ p, r: perId.get(p.id) })).filter((x): x is { p: (typeof d.producten)[number]; r: (typeof rows)[number] } => Boolean(x.r));
    if (gekozen.length === 0) throw AppError.validation("Deze producten zijn niet meer beschikbaar.");

    // klantfoto: opnieuw verkleind en zonder metadata (GPS/EXIF), zodat die nooit naar het model gaat
    const klantBytes = Buffer.from(d.foto.split(",")[1] ?? "", "base64");
    const klant = await sharp(klantBytes, { failOn: "none" }).rotate().resize(1280, 1280, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();

    const fotos = await Promise.all(gekozen.map((x) => productFoto(x.r.imageUrl)));
    const bronnen: { b64: string; mime: string }[] = [{ b64: klant.toString("base64"), mime: "image/jpeg" }];
    const lijst: PasProduct[] = gekozen.map((x, i) => {
      const foto = fotos[i];
      if (foto) bronnen.push(foto);
      return { name: x.r.name, category: x.r.category, description: x.r.description, maat: x.p.maat, kleur: x.p.kleur, heeftFoto: Boolean(foto) };
    });

    const meta = await sharp(klant).metadata();
    const verhouding = meta.width && meta.height && meta.height / meta.width > 1.2 ? "3:4" : meta.width && meta.height && meta.width > meta.height ? "4:3" : "1:1";
    const beeld = await geminiBeeld({ prompt: pasFotoPrompt(lijst), bronnen, verhouding, grootte: "1K" });
    const uit = await sharp(Buffer.from(beeld.b64, "base64")).jpeg({ quality: 88 }).toBuffer();
    logger.info("shop pas-foto gemaakt", { producten: gekozen.length });
    return NextResponse.json({ ok: true, image: `data:image/jpeg;base64,${uit.toString("base64")}` });
  } catch (err) {
    if (err instanceof AppError) {
      // de tegoedmelding is voor de eigenaar; de klant krijgt een gewone zin
      if (err.code === "PRECONDITION_FAILED" || /tegoed|billing/i.test(err.message)) return NextResponse.json({ error: { code: "NIET_BESCHIKBAAR", message: PAS_FOUTEN.tegoed } }, { status: 503 });
      if (err.code === "UPSTREAM_UNAVAILABLE" && /geen foto|Google maakte/i.test(err.message)) return NextResponse.json({ error: { code: "GEBLOKKEERD", message: PAS_FOUTEN.geblokkeerd } }, { status: 422 });
    }
    const res = jsonError(err);
    if (res.status >= 500) logger.error("shop pas-foto mislukt", { error: (err as Error).message });
    return res;
  }
}
