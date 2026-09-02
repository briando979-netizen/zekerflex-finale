import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

process.env.UPLOADS_DIR = mkdtempSync(join(tmpdir(), "zf-uploads-"));

const uploadCreate = vi.fn();
const uploadFindUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    upload: {
      create: (...a: unknown[]) => uploadCreate(...a),
      findUnique: (...a: unknown[]) => uploadFindUnique(...a),
    },
  },
}));

import { readUpload, storeUpload } from "@/lib/storage/local";

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.clearAllMocks());

describe("storeUpload", () => {
  it("writes bytes to disk and returns metadata", async () => {
    uploadCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "u1",
      ...data,
    }));
    const stored = await storeUpload({
      filename: "notes final.txt",
      mimeType: "text/plain",
      bytes: Buffer.from("hallo wereld"),
      uploadedById: "usr_admin",
    });
    expect(stored.id).toBe("u1");
    expect(stored.filename).toBe("notes final.txt");
    expect(stored.sizeBytes).toBe(12);
    expect(stored.storageKey).toMatch(/^\d{4}-\d{2}-\d{2}\/.+notes final\.txt$/);
  });

  it("rejects an empty file", async () => {
    await expect(
      storeUpload({ filename: "x", mimeType: "text/plain", bytes: Buffer.alloc(0) }),
    ).rejects.toMatchObject({ status: 422 });
  });
});

describe("readUpload", () => {
  it("round-trips a stored file", async () => {
    uploadCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "u2",
      ...data,
    }));
    const stored = await storeUpload({
      filename: "doc.txt",
      mimeType: "text/plain",
      bytes: Buffer.from("inhoud"),
    });
    uploadFindUnique.mockResolvedValue({
      id: "u2",
      storageKey: stored.storageKey,
      filename: "doc.txt",
      mimeType: "text/plain",
    });
    const back = await readUpload("u2");
    expect(back.bytes.toString()).toBe("inhoud");
  });

  it("refuses a storageKey that escapes the uploads root", async () => {
    uploadFindUnique.mockResolvedValue({
      id: "bad",
      storageKey: "../../etc/passwd",
      filename: "passwd",
      mimeType: "text/plain",
    });
    await expect(readUpload("bad")).rejects.toMatchObject({ status: 403 });
  });
});
