import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/lib/env";

let client: S3Client | undefined;

function s3(): S3Client {
  if (!env.STORAGE_S3_BUCKET || !env.STORAGE_S3_ACCESS_KEY_ID || !env.STORAGE_S3_SECRET_ACCESS_KEY) {
    throw new Error("S3 storage requires bucket and access credentials");
  }
  const config = {
    region: env.STORAGE_S3_REGION,
    forcePathStyle: env.STORAGE_S3_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: env.STORAGE_S3_ACCESS_KEY_ID,
      secretAccessKey: env.STORAGE_S3_SECRET_ACCESS_KEY,
    },
    ...(env.STORAGE_S3_ENDPOINT ? { endpoint: env.STORAGE_S3_ENDPOINT } : {}),
  };
  client ??= new S3Client(config);
  return client;
}

export async function putObject(input: {
  key: string;
  body: Buffer;
  contentType: string;
}): Promise<void> {
  await s3().send(
    new PutObjectCommand({
      Bucket: env.STORAGE_S3_BUCKET,
      Key: input.key,
      Body: input.body,
      ContentType: input.contentType,
      ServerSideEncryption: "AES256",
    }),
  );
}

export async function getObjectUrl(key: string): Promise<string> {
  return getSignedUrl(
    s3(),
    new GetObjectCommand({ Bucket: env.STORAGE_S3_BUCKET, Key: key }),
    { expiresIn: env.STORAGE_SIGNED_URL_TTL_S },
  );
}

export async function getObjectBytes(key: string): Promise<Buffer> {
  const response = await s3().send(
    new GetObjectCommand({ Bucket: env.STORAGE_S3_BUCKET, Key: key }),
  );
  if (!response.Body) throw new Error("S3 object has no body");
  return Buffer.from(await response.Body.transformToByteArray());
}
