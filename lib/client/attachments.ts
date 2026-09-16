import {
  confirmAttachment,
  presignAttachmentUpload,
  type AttachmentOwner,
} from "@/lib/actions/attachments";
import type { AttachmentItem } from "@/types/api";

export type UploadAttachmentResult =
  | { ok: true; attachment: AttachmentItem }
  | { ok: false; error: string };

/**
 * Upload satu file evidence: presign -> PUT langsung ke R2 -> confirm.
 *
 * Dipakai dua tempat dengan kebutuhan berbeda:
 * - AttachmentsPanel: owner (TestCase/TestRunResult/Bug) sudah ada sejak awal.
 * - Form buat bug ad-hoc: owner BARU ada setelah bug-nya dibuat, jadi file
 *   ditahan dulu di klien lalu diunggah lewat helper ini saat submit.
 */
export async function uploadAttachmentFile(
  file: File,
  owner: AttachmentOwner,
  onProgress?: (percent: number) => void
): Promise<UploadAttachmentResult> {
  const presign = await presignAttachmentUpload({
    fileName: file.name,
    mimeType: file.type,
    size: file.size,
    owner,
  });
  if (presign.error || !presign.uploadUrl || !presign.storageKey) {
    return { ok: false, error: presign.error ?? "Gagal menyiapkan upload." };
  }

  // PUT langsung ke R2 — pakai XHR agar progres upload bisa ditampilkan
  // (fetch tidak menyediakan progress upload).
  try {
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", presign.uploadUrl!);
      xhr.setRequestHeader("Content-Type", file.type);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () =>
        xhr.status >= 200 && xhr.status < 300
          ? resolve()
          : reject(new Error(`Upload gagal (HTTP ${xhr.status}).`));
      xhr.onerror = () => reject(new Error("Upload gagal — periksa koneksi."));
      xhr.send(file);
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Upload gagal." };
  }

  const confirmed = await confirmAttachment({
    storageKey: presign.storageKey,
    fileName: file.name,
    mimeType: file.type,
    size: file.size,
    owner,
  });
  if (confirmed.error || !confirmed.attachment) {
    return { ok: false, error: confirmed.error ?? "Gagal menyimpan attachment." };
  }
  return { ok: true, attachment: confirmed.attachment };
}
