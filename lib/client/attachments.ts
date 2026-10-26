import {
  confirmAttachment,
  presignAttachmentUpload,
  type AttachmentOwner,
} from "@/lib/actions/attachments";
import { compressVideoFile } from "@/lib/client/video-compress";
import type { AttachmentItem } from "@/types/api";

export type UploadAttachmentResult =
  | { ok: true; attachment: AttachmentItem }
  | { ok: false; error: string };

/** Tahap upload yang perlu diketahui UI (video dikompres dulu di browser). */
export type UploadPhase = "compressing" | "uploading";

/**
 * Upload satu file evidence: [kompres video] -> presign -> PUT langsung ke R2
 * -> confirm.
 *
 * Dipakai dua tempat dengan kebutuhan berbeda:
 * - AttachmentsPanel: owner (TestCase/TestRunResult/Bug) sudah ada sejak awal.
 * - Form buat bug ad-hoc: owner BARU ada setelah bug-nya dibuat, jadi file
 *   ditahan dulu di klien lalu diunggah lewat helper ini saat submit.
 */
export async function uploadAttachmentFile(
  file: File,
  owner: AttachmentOwner,
  onProgress?: (percent: number) => void,
  onPhase?: (phase: UploadPhase) => void
): Promise<UploadAttachmentResult> {
  /**
   * Video dikecilkan dulu di browser supaya yang tersimpan di R2 adalah hasil
   * kompresi. `payload` (bukan `file`) yang dipakai untuk presign, PUT, dan
   * confirm supaya `Attachment.size`/`mimeType` cocok dengan byte yang benar.
   */
  let payload = file;
  if (file.type.startsWith("video/")) {
    onPhase?.("compressing");
    onProgress?.(0);
    payload = (await compressVideoFile(file, onProgress)).file;
  }

  onPhase?.("uploading");
  onProgress?.(0);

  const presign = await presignAttachmentUpload({
    fileName: payload.name,
    mimeType: payload.type,
    size: payload.size,
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
      xhr.setRequestHeader("Content-Type", payload.type);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        if (xhr.status === 413) {
          reject(new Error("Ukuran lampiran terlalu besar (maks 100 MB)."));
          return;
        }
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else reject(new Error(`Upload gagal (HTTP ${xhr.status}).`));
      };
      // Kegagalan di level jaringan (server tak terjangkau / offline).
      xhr.onerror = () => reject(new Error("Koneksi internet terputus. Periksa jaringan Anda."));
      xhr.send(payload);
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Upload gagal." };
  }

  const confirmed = await confirmAttachment({
    storageKey: presign.storageKey,
    fileName: payload.name,
    mimeType: payload.type,
    size: payload.size,
    owner,
  });
  if (confirmed.error || !confirmed.attachment) {
    return { ok: false, error: confirmed.error ?? "Gagal menyimpan attachment." };
  }
  return { ok: true, attachment: confirmed.attachment };
}
