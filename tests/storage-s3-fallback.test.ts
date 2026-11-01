import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const envMock = vi.hoisted(() => ({
  env: {
    STORAGE_BACKEND: "db",
    UPLOADS_DIR: "./storage-test-does-not-exist",
    UPLOAD_MAX_BYTES: 1000,
    STORAGE_S3_BUCKET: undefined as string | undefined,
    STORAGE_S3_ACCESS_KEY_ID: undefined as string | undefined,
    STORAGE_S3_SECRET_ACCESS_KEY: undefined as string | undefined,
  },
}));
vi.mock("@/lib/env", () => envMock);

const getObjectBytes = vi.fn();
const deleteObject = vi.fn();
vi.mock("@/lib/storage/s3", () => ({
  getObjectBytes: (...a: unknown[]) => getObjectBytes(...a),
  deleteObject: (...a: unknown[]) => deleteObject(...a),
  putObject: vi.fn(),
}));

const uploadRow = { id: "u1", filename: "foto.jpeg", mimeType: "image/jpeg", storageKey: "2026-10-28/abc-foto.jpeg" };
const uploadDelete = vi.fn(async () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    upload: { findUnique: async () => uploadRow, delete: () => uploadDelete() },
    $executeRaw: vi.fn(),
    $queryRaw: vi.fn(async () => []),
  },
}));

import { deleteUpload, readUpload } from "@/lib/storage/local";

function configureS3(on: boolean) {
  envMock.env.STORAGE_S3_BUCKET = on ? "oude-bucket" : undefined;
  envMock.env.STORAGE_S3_ACCESS_KEY_ID = on ? "key" : undefined;
  envMock.env.STORAGE_S3_SECRET_ACCESS_KEY = on ? "secret" : undefined;
}

beforeEach(() => configureS3(false));
afterEach(() => vi.clearAllMocks());

describe("oude uploads die niet op de VPS-schijf staan", () => {
  it("geeft zonder S3-gegevens een nette 'niet gevonden'", async () => {
    await expect(readUpload("u1")).rejects.toMatchObject({ message: "Bestand ontbreekt op schijf" });
    expect(getObjectBytes).not.toHaveBeenCalled();
  });

  it("haalt het bestand uit S3 zodra de gegevens zijn ingesteld", async () => {
    configureS3(true);
    getObjectBytes.mockResolvedValue(Buffer.from("beeld"));
    const file = await readUpload("u1");
    expect(getObjectBytes).toHaveBeenCalledWith(uploadRow.storageKey);
    expect(file.bytes.toString()).toBe("beeld");
    expect(file.mimeType).toBe("image/jpeg");
    expect(file.filename).toBe("foto.jpeg");
  });

  it("blijft 'niet gevonden' geven als het bestand ook niet in S3 staat", async () => {
    configureS3(true);
    getObjectBytes.mockRejectedValue(new Error("NoSuchKey"));
    await expect(readUpload("u1")).rejects.toMatchObject({ message: "Bestand ontbreekt op schijf" });
  });

  it("verwijdert het bestand ook uit S3, zodat een verwijderverzoek echt werkt", async () => {
    configureS3(true);
    await deleteUpload("u1");
    expect(deleteObject).toHaveBeenCalledWith(uploadRow.storageKey);
    expect(uploadDelete).toHaveBeenCalled();
  });

  it("raakt S3 niet aan als het niet is ingesteld", async () => {
    await deleteUpload("u1");
    expect(deleteObject).not.toHaveBeenCalled();
    expect(uploadDelete).toHaveBeenCalled();
  });
});
