-- Upload bytes in Postgres: used automatically on serverless hosts (Vercel),
-- where writing to the local disk fails. Additive; nothing existing changes.
CREATE TABLE "UploadBlob" (
    "storageKey" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UploadBlob_pkey" PRIMARY KEY ("storageKey")
);
