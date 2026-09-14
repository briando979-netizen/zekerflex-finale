import { afterEach, describe, expect, it, vi } from "vitest";

// ensureStorageWritable() used to always probe local disk, regardless of
// STORAGE_BACKEND — on Vercel that reported "writable: false" forever, even
// once S3/R2 was correctly configured, since it never looked at which
// backend was actually active. These tests pin the fix.
//
// vi.hoisted()'s factory runs before this file's own import statements are
// initialized, so node:fs/os/path are pulled in via require() here rather
// than a top-level import.
const envMock = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("node:fs") as typeof import("node:fs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const os = require("node:os") as typeof import("node:os");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require("node:path") as typeof import("node:path");
  return {
    STORAGE_BACKEND: "local" as "local" | "s3",
    UPLOADS_DIR: fs.mkdtempSync(path.join(os.tmpdir(), "zf-uploads-health-")),
    STORAGE_S3_BUCKET: "test-bucket",
  };
});
vi.mock("@/lib/env", () => ({ env: envMock }));

const putObject = vi.fn();
const getObjectBytes = vi.fn();
const deleteObject = vi.fn();
vi.mock("@/lib/storage/s3", () => ({
  putObject: (...a: unknown[]) => putObject(...a),
  getObjectBytes: (...a: unknown[]) => getObjectBytes(...a),
  deleteObject: (...a: unknown[]) => deleteObject(...a),
}));

import { ensureStorageWritable } from "@/lib/storage/local";

afterEach(() => {
  vi.clearAllMocks();
  envMock.STORAGE_BACKEND = "local";
});

describe("ensureStorageWritable — local backend", () => {
  it("round-trips a probe file on disk", async () => {
    const result = await ensureStorageWritable();
    expect(result.writable).toBe(true);
    expect(result.dir).toBe(envMock.UPLOADS_DIR);
    expect(putObject).not.toHaveBeenCalled();
  });
});

describe("ensureStorageWritable — s3 backend", () => {
  it("round-trips a probe object through the configured bucket, not local disk", async () => {
    envMock.STORAGE_BACKEND = "s3";
    putObject.mockResolvedValue(undefined);
    getObjectBytes.mockResolvedValue(Buffer.from("ok"));
    deleteObject.mockResolvedValue(undefined);

    const result = await ensureStorageWritable();

    expect(result.writable).toBe(true);
    expect(result.dir).toBe("s3://test-bucket");
    expect(putObject).toHaveBeenCalledTimes(1);
    expect(getObjectBytes).toHaveBeenCalledTimes(1);
    expect(deleteObject).toHaveBeenCalledTimes(1);
  });

  it("reports the real failure when the bucket/credentials are wrong", async () => {
    envMock.STORAGE_BACKEND = "s3";
    putObject.mockRejectedValue(new Error("SignatureDoesNotMatch"));

    const result = await ensureStorageWritable();

    expect(result.writable).toBe(false);
    expect(result.detail).toBe("SignatureDoesNotMatch");
  });

  it("flags a mismatched roundtrip instead of reporting false success", async () => {
    envMock.STORAGE_BACKEND = "s3";
    putObject.mockResolvedValue(undefined);
    getObjectBytes.mockResolvedValue(Buffer.from("not ok"));

    const result = await ensureStorageWritable();

    expect(result.writable).toBe(false);
    expect(deleteObject).not.toHaveBeenCalled();
  });
});
