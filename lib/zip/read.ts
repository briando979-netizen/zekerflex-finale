import { inflateRawSync } from "node:zlib";

// ---------------------------------------------------------------------------
// Minimal ZIP reader (stored + deflate, no ZIP64) — enough to pull the chat
// text out of WhatsApp's "export with media" archive. Reads the central
// directory, so it trusts compressed/uncompressed sizes from there and caps
// what it will inflate.
// ---------------------------------------------------------------------------

export interface ZipEntry {
  name: string;
  size: number;
  read: () => Buffer;
}

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

export function readZip(buf: Buffer, maxEntryBytes = 20 * 1024 * 1024): ZipEntry[] {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65_535); i--) {
    if (buf.readUInt32LE(i) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("zip: no end-of-central-directory record");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries: ZipEntry[] = [];
  for (let n = 0; n < count; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== CENTRAL) throw new Error("zip: bad central directory");
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const compressed = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString(flags & 0x800 ? "utf8" : "latin1");
    p += 46 + nameLen + extraLen + commentLen;
    entries.push({
      name,
      size,
      read: () => {
        if (size > maxEntryBytes) throw new Error(`zip: ${name} is too large`);
        if (buf.readUInt32LE(localOffset) !== LOCAL) throw new Error("zip: bad local header");
        const start = localOffset + 30 + buf.readUInt16LE(localOffset + 26) + buf.readUInt16LE(localOffset + 28);
        const data = buf.subarray(start, start + compressed);
        if (method === 0) return Buffer.from(data);
        if (method === 8) return inflateRawSync(data, { maxOutputLength: maxEntryBytes });
        throw new Error(`zip: unsupported compression method ${method}`);
      },
    });
  }
  return entries;
}
