"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/permissions";
import { copyObject } from "@/lib/storage/r2";

export type AutomationBugActionState = {
  error?: string;
  success?: boolean;
  /** Id bug yang baru dibuat — dipakai pemanggil untuk update daftar lokal. */
  bugId?: string;
};

function handleError(error: unknown): AutomationBugActionState {
  console.error(error);
  return { error: "Terjadi kesalahan. Coba lagi." };
}

/* ============ Automation Link ============ */

/** Simpan/link automation ke TestCase (manual dari halaman detail TC). */
export async function upsertAutomationLink(
  testCaseId: string,
  data: {
    externalTestId: string;
    scriptPath?: string;
    status?: "NOT_AUTOMATED" | "AUTOMATED" | "FAILING" | "UNSTABLE";
  }
): Promise<AutomationBugActionState> {
  await requireRole("QA");
  const externalTestId = data.externalTestId.trim();
  if (!externalTestId) {
    return { error: "External Test ID wajib diisi." };
  }

  try {
    await prisma.automationLink.upsert({
      where: { testCaseId },
      create: {
        testCaseId,
        externalTestId,
        scriptPath: data.scriptPath?.trim() || null,
        status: data.status ?? "NOT_AUTOMATED",
      },
      update: {
        externalTestId,
        scriptPath: data.scriptPath?.trim() || null,
        status: data.status ?? "NOT_AUTOMATED",
      },
    });
    revalidatePath(`/test-cases/${testCaseId}`);
    return { success: true };
  } catch (error) {
    return handleError(error);
  }
}

/** Hapus link automation dari TestCase. */
export async function removeAutomationLink(testCaseId: string): Promise<AutomationBugActionState> {
  await requireRole("QA");
  try {
    await prisma.automationLink.delete({ where: { testCaseId } });
    revalidatePath(`/test-cases/${testCaseId}`);
    return { success: true };
  } catch (error) {
    return handleError(error);
  }
}

/* ============ Bug ============ */

/** Buat bug baru, opsional terhubung ke TestCase dan/atau TestRunResult.
 *  Deskripsi bisa memakai mention @TC-ID — otomatis me-link ke TestCase tsb. */
export async function createBug(data: {
  title: string;
  description?: string;
  expectedResult?: string;
  severity?: string;
  externalLink?: string;
  testCaseId?: string | null;
  testRunResultId?: string | null;
  /** Suite/modul tempat temuan ad-hoc berada. */
  suiteId?: string | null;
}): Promise<AutomationBugActionState> {
  const user = await requireRole("DEVELOPER");
  const title = data.title.trim();
  if (!title) {
    return { error: "Judul bug wajib diisi." };
  }

  try {
    // Deteksi mention @TC-ID di deskripsi -> cari TestCase, link otomatis.
    let linkedTestCaseId = data.testCaseId || null;
    if (!linkedTestCaseId && data.description) {
      const mentions = data.description.match(/@([A-Za-z0-9._-]+)/g) ?? [];
      for (const m of mentions) {
        const tcId = m.slice(1);
        const found = await prisma.testCase.findUnique({
          where: { tcId },
          select: { id: true },
        });
        if (found) {
          linkedTestCaseId = found.id;
          break;
        }
      }
    }

    /**
     * Suite + project ditentukan DI SERVER, bukan dari klien:
     * - bug dari eksekusi run mewarisi suite dari TestCase-nya;
     * - bug ad-hoc memakai suite yang dipilih QA di form.
     * Project selalu diturunkan dari suite supaya keduanya tidak pernah
     * bertentangan, dan tiap bug pasti punya rujukan untuk diagregasi.
     */
    let linkedSuiteId = data.suiteId?.trim() || null;
    if (!linkedSuiteId && linkedTestCaseId) {
      const tc = await prisma.testCase.findUnique({
        where: { id: linkedTestCaseId },
        select: { suiteId: true },
      });
      linkedSuiteId = tc?.suiteId ?? null;
    }

    let linkedProjectId: string | null = null;
    if (linkedSuiteId) {
      const suite = await prisma.suite.findUnique({
        where: { id: linkedSuiteId },
        select: { projectId: true },
      });
      if (!suite) return { error: "Suite tidak ditemukan." };
      linkedProjectId = suite.projectId;
    }

    const bug = await prisma.bug.create({
      data: {
        title,
        description: data.description?.trim() || null,
        expectedResult: data.expectedResult?.trim() || null,
        severity: data.severity?.trim() || null,
        externalLink: data.externalLink?.trim() || null,
        testCaseId: linkedTestCaseId,
        testRunResultId: data.testRunResultId || null,
        suiteId: linkedSuiteId,
        projectId: linkedProjectId,
        createdById: user.id,
      },
    });
    if (linkedTestCaseId) revalidatePath(`/test-cases/${linkedTestCaseId}`);
    if (data.testRunResultId) revalidatePath(`/test-runs`);

    /**
     * Warisi evidence dari hasil eksekusi yang jadi sumber bug ini.
     *
     * Baris `Attachment` hanya boleh punya SATU pemilik (dijaga check
     * constraint `Attachment_one_owner_check` di DB), jadi file-nya digandakan
     * di R2 (server-side copy, byte tidak lewat server) lalu dibuat baris baru
     * milik bug. Dengan begitu evidence langsung muncul di section
     * "Evidence (Lampiran)" pada Bug Detail tanpa upload ulang, dan kedua sisi
     * (run result & bug) tetap bisa hapus sendiri-sendiri.
     *
     * Best-effort: kalau penyalinan satu file gagal, bug tetap dibuat dan file
     * itu saja yang dilewatkan (dicatat di log server).
     */
    if (data.testRunResultId) {
      const source = await prisma.attachment.findMany({
        where: { testRunResultId: data.testRunResultId },
        select: { fileName: true, mimeType: true, size: true, storageKey: true },
      });
      let copied = 0;
      for (const att of source) {
        const newKey = await copyObject(att.storageKey, att.fileName, att.mimeType);
        if (!newKey) continue;
        await prisma.attachment.create({
          data: {
            fileName: att.fileName,
            mimeType: att.mimeType,
            size: att.size,
            storageKey: newKey,
            bugId: bug.id,
            uploadedById: user.id,
          },
        });
        copied++;
      }
      if (copied > 0) revalidatePath(`/bugs`);
    }

    return { success: true, bugId: bug.id };
  } catch (error) {
    return handleError(error);
  }
}

/** Link bug existing ke TestCase. */
export async function linkBugToTestCase(
  bugId: string,
  testCaseId: string
): Promise<AutomationBugActionState> {
  await requireRole("QA");
  try {
    await prisma.bug.update({ where: { id: bugId }, data: { testCaseId } });
    revalidatePath(`/test-cases/${testCaseId}`);
    return { success: true };
  } catch (error) {
    return handleError(error);
  }
}

/** Update status bug. resolvedAt di-set otomatis saat RESOLVED/CLOSED,
 *  dan dikosongkan jika bug dibuka kembali (OPEN/IN_PROGRESS).
 *  Saat bug selesai (RESOLVED/CLOSED), TestRunResult FAIL yang tertaut
 *  otomatis diubah menjadi PASS (defect sudah diperbaiki). */
export async function updateBugStatus(
  bugId: string,
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED"
): Promise<AutomationBugActionState> {
  const user = await requireRole("DEVELOPER");
  try {
    const isResolved = status === "RESOLVED" || status === "CLOSED";

    // Ambil tautan run result (untuk auto-pass) + runId (untuk revalidate).
    const bug = await prisma.bug.findUnique({
      where: { id: bugId },
      select: {
        testCaseId: true,
        testRunResultId: true,
        testRunResult: { select: { runId: true } },
      },
    });
    if (!bug) {
      return { error: "Bug tidak ditemukan." };
    }

    await prisma.$transaction([
      prisma.bug.update({
        where: { id: bugId },
        data: { status, resolvedAt: isResolved ? new Date() : null },
      }),
      // Bug selesai => hasil eksekusi FAIL yang melingkari bug ini ikut PASS.
      ...(isResolved && bug.testRunResultId
        ? [
            prisma.testRunResult.updateMany({
              where: { id: bug.testRunResultId, status: "FAIL" },
              data: { status: "PASS", updatedById: user.id },
            }),
          ]
        : []),
    ]);

    revalidatePath(`/test-cases`);
    if (bug.testCaseId) revalidatePath(`/test-cases/${bug.testCaseId}`);
    if (bug.testRunResult?.runId) revalidatePath(`/test-runs/${bug.testRunResult.runId}`);
    revalidatePath(`/test-runs`);
    return { success: true };
  } catch (error) {
    return handleError(error);
  }
}

/** Unlink bug dari hasil run (testRunResultId di-null-kan). */
export async function unlinkBugFromRunResult(
  bugId: string,
  runResultId: string
): Promise<AutomationBugActionState> {
  await requireRole("QA");
  try {
    await prisma.bug.update({
      where: { id: bugId, testRunResultId: runResultId },
      data: { testRunResultId: null },
    });
    revalidatePath("/test-runs");
    return { success: true };
  } catch (error) {
    return handleError(error);
  }
}

/** Hapus bug. */
export async function deleteBug(bugId: string): Promise<AutomationBugActionState> {
  await requireRole("QA");
  try {
    const bug = await prisma.bug.findUnique({ where: { id: bugId }, select: { testCaseId: true } });
    await prisma.bug.delete({ where: { id: bugId } });
    if (bug?.testCaseId) revalidatePath(`/test-cases/${bug.testCaseId}`);
    return { success: true };
  } catch (error) {
    return handleError(error);
  }
}
