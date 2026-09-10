import { randomUUID } from "node:crypto";
import {
  S3Client,
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { MAX_ATTACHMENT_BYTES, isAllowedMime } from "@/lib/storage/limits";

export { MAX_ATTACHMENT_BYTES, isAllowedMime };

/** Presigned GET berlaku 1 jam — cukup untuk sesi melihat halaman. */
const GET_EXPIRES_SECONDS = 60 * 60;
/** Presigned PUT singkat: hanya untuk satu kali upload. */
const PUT_EXPIRES_SECONDS = 10 * 60;

type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
};

/**
 * Baca konfigurasi R2. Sengaja TIDAK throw saat modul di-import — kalau env
 * belum diisi, aplikasi harus tetap jalan dan UI menampilkan pesan
 * "storage belum dikonfigurasi", bukan error 500 di seluruh halaman.
 */
export function r2Config(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.R2_BUCKET?.trim();
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;
  return { accountId, accessKeyId, secretAccessKey, bucket };
}

export function isStorageConfigured(): boolean {
  return r2Config() !== null;
}

let cached: { client: S3Client; bucket: string } | null = null;

function getClient(): { client: S3Client; bucket: string } {
  const cfg = r2Config();
  if (!cfg) {
    throw new Error(
      "Storage belum dikonfigurasi. Isi R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, dan R2_BUCKET di .env"
    );
  }
  if (cached) return cached;
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
  });
  cached = { client, bucket: cfg.bucket };
  return cached;
}

/** Ekstensi aman dari mimeType (bukan dari nama file user). */
function extensionFor(mimeType: string, fileName: string): string {
  const fromName = fileName.includes(".") ? fileName.split(".").pop() ?? "" : "";
  const safe = fromName.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (safe && safe.length <= 5) return safe;
  const map: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "video/webm": "webm",
  };
  return map[mimeType] ?? "bin";
}

/**
 * Buat object key baru: `attachments/<tanggal>/<uuid>.<ext>`.
 * Key dibuat server (bukan dari nama file) untuk mencegah path traversal
 * dan tabrakan nama.
 */
export function buildStorageKey(fileName: string, mimeType: string): string {
  const ext = extensionFor(mimeType, fileName);
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `attachments/${yyyy}-${mm}/${randomUUID()}.${ext}`;
}

/** URL untuk browser meng-upload langsung ke R2 (byte tidak lewat server). */
export async function presignPutUrl(storageKey: string, mimeType: string): Promise<string> {
  const { client, bucket } = getClient();
  return getSignedUrl(
    client,
    new PutObjectCommand({ Bucket: bucket, Key: storageKey, ContentType: mimeType }),
    { expiresIn: PUT_EXPIRES_SECONDS }
  );
}

/** URL sementara untuk menampilkan file dari bucket private. */
export async function presignGetUrl(storageKey: string): Promise<string> {
  const { client, bucket } = getClient();
  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucket, Key: storageKey }),
    { expiresIn: GET_EXPIRES_SECONDS }
  );
}

/** Presign banyak sekaligus; key yang gagal di-skip (tidak mematikan halaman). */
export async function presignGetUrls(keys: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!isStorageConfigured()) return out;
  await Promise.all(
    keys.map(async (k) => {
      try {
        out.set(k, await presignGetUrl(k));
      } catch {
        // abaikan — file mungkin sudah tidak ada
      }
    })
  );
  return out;
}

/** Hapus objek dari R2. Best-effort: kegagalan tidak melempar error. */
export async function deleteObject(storageKey: string): Promise<boolean> {
  if (!isStorageConfigured()) return false;
  try {
    const { client, bucket } = getClient();
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: storageKey }));
    return true;
  } catch (e) {
    console.error("Gagal hapus objek R2:", storageKey, e);
    return false;
  }
}

/** Cek objek benar-benar ada (dipakai saat konfirmasi upload). */
export async function objectExists(storageKey: string): Promise<boolean> {
  const { client, bucket } = getClient();
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: storageKey }));
    return true;
  } catch {
    return false;
  }
}
