import sharp from "sharp";
import { schoonMaat, type FotoMaat } from "@/lib/kyc/foto-bron";

// De maat van een ID-foto uit het beeld zelf (alleen metadata, rechtop volgens EXIF). Zie lib/kyc/foto-bron.ts. Een
// onleesbaar beeld geeft null; dit mag het insturen nooit tegenhouden.
export async function fotoMaat(bytes: Uint8Array): Promise<FotoMaat | null> {
  try {
    const m = await sharp(bytes, { failOn: "none", limitInputPixels: 40_000_000 }).metadata();
    const gedraaid = (m.orientation ?? 1) >= 5;
    return schoonMaat({ breed: gedraaid ? m.height : m.width, hoog: gedraaid ? m.width : m.height });
  } catch {
    return null;
  }
}
