"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/permissions";

export type AutomationBugActionState = {
  error?: string;
  success?: boolean;
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

    const bug = await prisma.bug.create({
      data: {
        title,
        description: data.description?.trim() || null,
        expectedResult: data.expectedResult?.trim() || null,
        severity: data.severity?.trim() || null,
        externalLink: data.externalLink?.trim() || null,
        testCaseId: linkedTestCaseId,
        testRunResultId: data.testRunResultId || null,
        createdById: user.id,
      },
    });
    if (linkedTestCaseId) revalidatePath(`/test-cases/${linkedTestCaseId}`);
    if (data.testRunResultId) revalidatePath(`/test-runs`);
    return { success: true, bugId: bug.id } as AutomationBugActionState & { bugId?: string };
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
