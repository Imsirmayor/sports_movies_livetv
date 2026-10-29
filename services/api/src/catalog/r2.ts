import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { createLogger } from "@frankenstein/media-worker";

const log = createLogger("R2");

export type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  /** Public base for objects, e.g. https://cdn.example.com or https://pub-xxx.r2.dev */
  publicBaseUrl: string;
  /** Key prefix inside the bucket (no leading/trailing slash). */
  prefix: string;
};

export type R2Client = {
  uploadDir: (cacheKey: string, localDir: string) => Promise<string | null>;
  hasObject: (cacheKey: string, objectName?: string) => Promise<boolean>;
  publicPlaylistUrl: (cacheKey: string) => string;
};

function objectKey(prefix: string, cacheKey: string, name: string): string {
  const p = prefix ? `${prefix.replace(/\/$/, "")}/` : "";
  return `${p}${cacheKey}/${name}`;
}

/**
 * Optional Cloudflare R2 client (S3-compatible). Loaded dynamically so the API
 * runs without the SDK when R2 is not configured.
 */
export async function createR2Client(config: R2Config): Promise<R2Client> {
  const { S3Client, HeadObjectCommand, PutObjectCommand } = await import(
    "@aws-sdk/client-s3"
  );

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  const publicBase = config.publicBaseUrl.replace(/\/$/, "");

  return {
    publicPlaylistUrl(cacheKey: string) {
      const key = objectKey(config.prefix, cacheKey, "index.m3u8");
      return `${publicBase}/${key}`;
    },

    async hasObject(cacheKey: string, objectName = "index.m3u8") {
      try {
        await client.send(
          new HeadObjectCommand({
            Bucket: config.bucket,
            Key: objectKey(config.prefix, cacheKey, objectName),
          })
        );
        return true;
      } catch {
        return false;
      }
    },

    async uploadDir(cacheKey: string, localDir: string) {
      try {
        const names = await readdir(localDir);
        const uploadable = names.filter(
          (n) => n.endsWith(".m3u8") || n.endsWith(".ts") || n === "cache.json"
        );
        for (const name of uploadable) {
          const full = join(localDir, name);
          const st = await stat(full);
          if (!st.isFile()) continue;
          const body = createReadStream(full);
          const contentType = name.endsWith(".m3u8")
            ? "application/vnd.apple.mpegurl"
            : name.endsWith(".ts")
              ? "video/mp2t"
              : "application/json";
          await client.send(
            new PutObjectCommand({
              Bucket: config.bucket,
              Key: objectKey(config.prefix, cacheKey, name),
              Body: body,
              ContentType: contentType,
            })
          );
        }
        const url = `${publicBase}/${objectKey(config.prefix, cacheKey, "index.m3u8")}`;
        log.info(`R2 upload complete key=${cacheKey} playlist=${url}`);
        return url;
      } catch (err) {
        log.warn(`R2 upload failed key=${cacheKey}: ${err instanceof Error ? err.message : err}`);
        return null;
      }
    },
  };
}
