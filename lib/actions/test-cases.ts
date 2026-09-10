"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/permissions";
import { featurePrefixFromName } from "@/lib/format";

export type TestCaseActionState = {
  error?: string;
  success?: boolean;
  testCase?: {
    id: string;
    tcId: string;
    title: string;
    scenario: string | null;
    precondition: string | null;
    steps: string | null;
    testData: string | null;
    expectedResult: string | null;
    priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    status: "DRAFT" | "ACTIVE" | "DEPRECATED";
    sectionId: string | null;
    createdAt: string;
    createdBy?: { name: string | null } | null;
  };
};

function handleError(error: unknown): TestCaseActionState {
  console.error(error);
  if (error instanceof Error && error.message.includes("Unique constraint")) {
    return { error: "TC ID sudah dipakai, gunakan ID lain." };
  }
  return { error: "Terjadi kesalahan. Coba lagi." };
}

/** Catat aktivitas ke ActivityLog untuk audit trail per TestCase. */
async function logActivity(
  testCaseId: string,
  action: "CREATED" | "UPDATED" | "DELETED" | "STATUS_CHANGED",
  detail: string,
  userId: string
): Promise<void> {
  try {
    await prisma.activityLog.create({
      data: { testCaseId, action, detail, userId },
    });
  } catch (error) {
    console.error("Gagal mencatat activity log:", error);
  }
}

/** Buat TC ID otomatis: `{prefix}-{seq}` — prefix dari nama suite/fitur
 *  (contoh "Attendance" -> atndc), urut mulai 001 per prefix, huruf kecil semua.
 *  Override manual tetap dihormati (dikecilkan). */
async function buildTcId(suiteId: string, override?: string): Promise<string> {
  if (override && override.trim()) return override.trim().toLowerCase();

  const suite = await prisma.suite.findUnique({
    where: { id: suiteId },
    select: { name: true },
  });
  if (!suite) throw new Error("Suite tidak ditemukan.");

  const prefix = featurePrefixFromName(suite.name).toLowerCase();
  for (let attempt = 0; attempt < 20; attempt++) {
    const count = await prisma.testCase.count({
      where: { tcId: { startsWith: `${prefix}-` } },
    });
    const candidate = `${prefix}-${String(count + 1).padStart(3, "0")}`;
    const clash = await prisma.testCase.findUnique({
      where: { tcId: candidate },
      select: { id: true },
    });
    if (!clash) return candidate;
  }
  throw new Error("Gagal membuat TC ID unik.");
}

/* ------------------------- Test Case ------------------------- */

export async function createTestCase(
  formData: FormData
): Promise<TestCaseActionState> {
  const user = await requireRole("QA");
  const suiteId = String(formData.get("suiteId") ?? "").trim() || null;
  const sectionId = String(formData.get("sectionId") ?? "").trim() || null;
  const title = String(formData.get("title") ?? "").trim();
  const scenario = String(formData.get("scenario") ?? "").trim();
  const tcIdOverride = String(formData.get("tcId") ?? "").trim();
  if (!suiteId) return { error: "Suite wajib diisi." };
  if (!title) return { error: "Judul test case wajib diisi." };
  if (!scenario) return { error: "Detail skenario wajib diisi." };

  try {
    const tcId = await buildTcId(suiteId, tcIdOverride);
    const created = await prisma.testCase.create({
      data: {
        tcId,
        title,
        suiteId,
        sectionId,
        scenario,
        precondition: String(formData.get("precondition") ?? "").trim() || null,
        steps: String(formData.get("steps") ?? "").trim() || null,
        testData: String(formData.get("testData") ?? "").trim() || null,
        expectedResult: String(formData.get("expectedResult") ?? "").trim() || null,
        priority: (String(formData.get("priority") ?? "MEDIUM") as
          | "LOW"
          | "MEDIUM"
          | "HIGH"
          | "CRITICAL"),
        status: (String(formData.get("status") ?? "DRAFT") as
          | "DRAFT"
          | "ACTIVE"
          | "DEPRECATED"),
        createdById: user.id,
      },
      select: {
        id: true,
        tcId: true,
        title: true,
        scenario: true,
        precondition: true,
        steps: true,
        testData: true,
        expectedResult: true,
        priority: true,
        status: true,
        sectionId: true,
        createdAt: true,
        createdBy: { select: { name: true } },
      },
    });
    await logActivity(created.id, "CREATED", `Test case dibuat (${tcId})`, user.id);
    revalidatePath(`/suites/${suiteId}`);
    return {
      success: true,
      testCase: { ...created, createdAt: created.createdAt.toISOString() },
    };
  } catch (error) {
    return handleError(error);
  }
}

export async function updateTestCase(
  formData: FormData
): Promise<TestCaseActionState> {
  const user = await requireRole("QA");
  const id = String(formData.get("id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const scenario = String(formData.get("scenario") ?? "").trim();
  if (!id || !title) return { error: "Judul test case wajib diisi." };
  if (!scenario) return { error: "Detail skenario wajib diisi." };

  try {
    const tc = await prisma.testCase.findUnique({ where: { id } });
    if (!tc) return { error: "Test case tidak ditemukan." };

    const suiteId = String(formData.get("suiteId") ?? "").trim() || null;
    const newStatus = (String(formData.get("status") ?? "DRAFT") as
      | "DRAFT"
      | "ACTIVE"
      | "DEPRECATED");
    await prisma.testCase.update({
      where: { id },
      data: {
        title,
        suiteId,
        scenario,
        precondition: String(formData.get("precondition") ?? "").trim() || null,
        steps: String(formData.get("steps") ?? "").trim() || null,
        testData: String(formData.get("testData") ?? "").trim() || null,
        expectedResult: String(formData.get("expectedResult") ?? "").trim() || null,
        priority: (String(formData.get("priority") ?? "MEDIUM") as
          | "LOW"
          | "MEDIUM"
          | "HIGH"
          | "CRITICAL"),
        status: newStatus,
      },
    });

    if (newStatus !== tc.status) {
      await logActivity(id, "STATUS_CHANGED", `Status berubah: ${tc.status} → ${newStatus}`, user.id);
    } else {
      await logActivity(id, "UPDATED", "Detail test case diperbarui", user.id);
    }
    revalidatePath(`/suites/${tc.suiteId}`);
    return { success: true };
  } catch (error) {
    return handleError(error);
  }
}

export async function deleteTestCase(formData: FormData): Promise<void> {
  const user = await requireRole("QA");
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  try {
    const tc = await prisma.testCase.findUnique({ where: { id } });
    if (tc) {
      // Catat sebelum hapus (activity log ikut ter-cascade saat TC dihapus)
      await logActivity(id, "DELETED", `Test case "${tc.title}" dihapus`, user.id);
      await prisma.testCase.delete({ where: { id } });
      revalidatePath(`/suites/${tc.suiteId}`);
    }
  } catch (error) {
    console.error(error);
  }
}

/** Quick update priority/status langsung dari tabel (tanpa modal). */
export async function quickUpdateTestCase(
  id: string,
  data: {
    priority?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    status?: "DRAFT" | "ACTIVE" | "DEPRECATED";
  }
): Promise<TestCaseActionState> {
  const user = await requireRole("QA");
  try {
    const tc = await prisma.testCase.findUnique({ where: { id } });
    if (!tc) return { error: "Test case tidak ditemukan." };

    await prisma.testCase.update({
      where: { id },
      data: {
        priority: data.priority ?? tc.priority,
        status: data.status ?? tc.status,
      },
    });

    if (data.status && data.status !== tc.status) {
      await logActivity(id, "STATUS_CHANGED", `Status berubah: ${tc.status} → ${data.status}`, user.id);
    } else if (data.priority && data.priority !== tc.priority) {
      await logActivity(id, "UPDATED", `Priority berubah: ${tc.priority} → ${data.priority}`, user.id);
    }

    revalidatePath(`/suites/${tc.suiteId}`);
    return { success: true };
  } catch (error) {
    return handleError(error);
  }
}
