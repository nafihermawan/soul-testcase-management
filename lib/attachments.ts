import { presignGetUrls } from "@/lib/storage/r2";
import type { AttachmentItem } from "@/types/api";

/** Baris Attachment dari Prisma (dengan uploader). */
export type AttachmentRow = {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  storageKey: string;
  createdAt: Date;
  uploadedBy: { name: string | null } | null;
};

/**
 * Ubah baris Attachment jadi payload API: presigned GET URL dibuat di sini
 * (murni HMAC lokal, tanpa network call) karena bucket R2 bersifat private.
 * Bila storage belum dikonfigurasi, `url` bernilai null dan UI menampilkan
 * placeholder alih-alih error.
 *
 * `presetUrls` dipakai bila pemanggil sudah mem-presign banyak key sekaligus
 * (mis. seluruh attachment satu halaman) supaya tidak presign per baris.
 */
export async function toAttachmentItems(
  rows: AttachmentRow[],
  presetUrls?: Map<string, string>
): Promise<AttachmentItem[]> {
  if (rows.length === 0) return [];
  const urls = presetUrls ?? (await presignGetUrls(rows.map((r) => r.storageKey)));
  return rows.map((r) => ({
    id: r.id,
    fileName: r.fileName,
    mimeType: r.mimeType,
    size: r.size,
    url: urls.get(r.storageKey) ?? null,
    createdAt: r.createdAt.toISOString(),
    uploadedBy: r.uploadedBy,
  }));
}
