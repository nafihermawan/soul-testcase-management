"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/permissions";
import {
  MAX_ATTACHMENT_BYTES,
  buildStorageKey,
  deleteObject,
  isAllowedMime,
  isStorageConfigured,
  objectExists,
  presignPutUrl,
} from "@/lib/storage/r2";

export type AttachmentActionState = {
  error?: string;
  success?: boolean;
  /** URL presigned untuk browser PUT langsung ke R2. */
  uploadUrl?: string;
  storageKey?: string;
};

export type AttachmentOwner = {
  testCaseId?: string | null;
  testRunResultId?: string | null;
  bugId?: string | null;
};

/** Pastikan tepat satu pemilik diisi, dan pemiliknya benar-benar ada. */
async function validateOwner(owner: AttachmentOwner): Promise<
  { ok: true; data: Required<AttachmentOwner> } | { ok: false; error: string }
> {
  const filled = (["testCaseId", "testRunResultId", "bugId"] as const).filter(
    (k) => owner[k]
  );
  if (filled.length !== 1) {
    return { ok: false, error: "Attachment harus menempel ke tepat satu pemilik." };
  }
  const key = filled[0];
  const id = owner[key] as string;

  const exists =
    key === "testCaseId"
      ? await prisma.testCase.count({ where: { id } })
      : key === "testRunResultId"
        ? await prisma.testRunResult.count({ where: { id } })
        : await prisma.bug.count({ where: { id } });
  if (!exists) return { ok: false, error: "Data tujuan attachment tidak ditemukan." };

  return {
    ok: true,
    data: {
      testCaseId: key === "testCaseId" ? id : null,
      testRunResultId: key === "testRunResultId" ? id : null,
      bugId: key === "bugId" ? id : null,
    },
  };
}

/**
 * Langkah 1 upload: minta izin + URL presigned. Byte file TIDAK lewat server
 * (Vercel Hobby membatasi body ~4.5MB), jadi browser PUT langsung ke R2.
 */
export async function presignAttachmentUpload(input: {
  fileName: string;
  mimeType: string;
  size: number;
  owner: AttachmentOwner;
}): Promise<AttachmentActionState> {
  await requireRole("QA");

  if (!isStorageConfigured()) {
    return {
      error:
        "Storage belum dikonfigurasi. Isi kredensial R2 di .env (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET).",
    };
  }
  const fileName = input.fileName?.trim();
  if (!fileName) return { error: "Nama file tidak valid." };
  if (!input.mimeType || !isAllowedMime(input.mimeType)) {
    return { error: "Hanya file gambar atau video yang diperbolehkan." };
  }
  if (!Number.isFinite(input.size) || input.size <= 0) {
    return { error: "Ukuran file tidak valid." };
  }
  if (input.size > MAX_ATTACHMENT_BYTES) {
    return {
      error: `Ukuran file melebihi batas ${Math.round(
        MAX_ATTACHMENT_BYTES / 1024 / 1024
      )} MB.`,
    };
  }

  const owner = await validateOwner(input.owner);
  if (!owner.ok) return { error: owner.error };

  try {
    const storageKey = buildStorageKey(fileName, input.mimeType);
    const uploadUrl = await presignPutUrl(storageKey, input.mimeType);
    return { success: true, uploadUrl, storageKey };
  } catch (error) {
    console.error(error);
    return { error: "Gagal menyiapkan upload. Coba lagi." };
  }
}

/**
 * Langkah 2 upload: setelah browser selesai PUT ke R2, simpan metadatanya.
 * File diverifikasi benar-benar ada di R2 (HEAD) supaya tidak ada baris DB
 * tanpa file.
 */
export async function confirmAttachment(input: {
  storageKey: string;
  fileName: string;
  mimeType: string;
  size: number;
  owner: AttachmentOwner;
}): Promise<AttachmentActionState> {
  const user = await requireRole("QA");

  if (!isStorageConfigured()) return { error: "Storage belum dikonfigurasi." };
  if (!input.storageKey?.startsWith("attachments/")) {
    return { error: "Storage key tidak valid." };
  }
  if (!isAllowedMime(input.mimeType)) {
    return { error: "Hanya file gambar atau video yang diperbolehkan." };
  }
  if (input.size > MAX_ATTACHMENT_BYTES) {
    return { error: "Ukuran file melebihi batas." };
  }

  const owner = await validateOwner(input.owner);
  if (!owner.ok) return { error: owner.error };

  try {
    if (!(await objectExists(input.storageKey))) {
      return { error: "File tidak ditemukan di storage. Upload gagal." };
    }

    const created = await prisma.attachment.create({
      data: {
        fileName: input.fileName.trim() || "file",
        mimeType: input.mimeType,
        size: Math.round(input.size),
        storageKey: input.storageKey,
        ...owner.data,
        uploadedById: user.id,
      },
      select: { id: true },
    });

    if (owner.data.testCaseId) revalidatePath(`/test-cases/${owner.data.testCaseId}`);
    if (owner.data.testRunResultId) revalidatePath(`/test-runs`);
    if (owner.data.bugId) revalidatePath(`/bugs`);
    return { success: true, storageKey: created.id };
  } catch (error) {
    console.error(error);
    return { error: "Gagal menyimpan metadata attachment." };
  }
}

/** Hapus attachment: baris DB dulu, lalu objek R2 (best-effort). */
export async function deleteAttachment(attachmentId: string): Promise<AttachmentActionState> {
  await requireRole("QA");
  try {
    const att = await prisma.attachment.findUnique({
      where: { id: attachmentId },
      select: {
        storageKey: true,
        testCaseId: true,
        testRunResultId: true,
        bugId: true,
      },
    });
    if (!att) return { error: "Attachment tidak ditemukan." };

    await prisma.attachment.delete({ where: { id: attachmentId } });
    const fileRemoved = await deleteObject(att.storageKey);
    if (!fileRemoved) {
      // Baris DB sudah hilang; file di R2 jadi yatim. Dicatat agar bisa disapu nanti.
      console.warn("Objek R2 gagal dihapus (orphan):", att.storageKey);
    }

    if (att.testCaseId) revalidatePath(`/test-cases/${att.testCaseId}`);
    if (att.testRunResultId) revalidatePath(`/test-runs`);
    if (att.bugId) revalidatePath(`/bugs`);
    return { success: true };
  } catch (error) {
    console.error(error);
    return { error: "Gagal menghapus attachment." };
  }
}
