// Draait één keer tijdens het bouwen van de image (Dockerfile): een proefbouw
// van een voorbeeld-app, zodat Gradle, de Android-plugin en de SDK-onderdelen
// al in de image (en daarna in het volume /opt/gradle) staan. Een echte bouw
// hoeft dan niets meer te downloaden en is in een paar minuten klaar.
import { promises as fs } from "node:fs";
import { deflateSync } from "node:zlib";
import { randomBytes } from "node:crypto";
import { WERK, bouw } from "./bouw.mjs";

// Een effen PNG van 512×512, zonder extra pakketten
function png(grootte, [r, g, b]) {
  const crcTabel = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const x of buf) c = (crcTabel[(c ^ x) & 0xff] ?? 0) ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const blok = (soort, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(soort), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(grootte, 0);
  ihdr.writeUInt32BE(grootte, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const rij = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: grootte }, () => [r, g, b]).flat())]);
  const ruw = Buffer.concat(Array.from({ length: grootte }, () => rij));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), blok("IHDR", ihdr), blok("IDAT", deflateSync(ruw)), blok("IEND", Buffer.alloc(0))]);
}

const id = "a_opwarmen";
const r = await bouw(
  id,
  {
    manifest: {
      pakketnaam: "nl.zekerflex.voorbeeld",
      host: "zekerflex.com",
      naam: "Voorbeeld",
      korteNaam: "Voorbeeld",
      kleur: "#1D4E89",
      achtergrond: "#FFFFFF",
      startUrl: "/",
      scope: "/",
      versie: 1,
      versieNaam: "1.0.1",
    },
    icoon: png(512, [29, 78, 137]).toString("base64"),
    sleutel: { wachtwoord: randomBytes(18).toString("base64url") },
  },
  (regel) => console.log(`[opwarmen] ${regel}`),
);
console.log(`[opwarmen] gelukt, vingerafdruk ${r.vingerafdruk.slice(0, 11)}…`);
await fs.rm(`${WERK}/bouw`, { recursive: true, force: true });
