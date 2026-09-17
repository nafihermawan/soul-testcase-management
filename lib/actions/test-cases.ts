"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/permissions";
import { featurePrefixFromName, platformPrefix } from "@/lib/format";

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

/** Buat TC ID otomatis: `{platform}-{prefix}-{seq}` — prefix platform dari
 *  Project.platform (mis. web/mob/hdw/api) dan prefix fitur dari nama suite
 *  (contoh "Overtime" -> ovrtm), urut mulai 001 per kombinasi, huruf kecil.
 *  Override manual tetap dihormati (dikecilkan). */
async function buildTcId(suiteId: string, override?: string): Promise<string> {
  if (override && override.trim()) return override.trim().toLowerCase();

  const suite = await prisma.suite.findUnique({
    where: { id: suiteId },
    select: { name: true, project: { select: { platform: true } } },
  });
  if (!suite) throw new Error("Suite tidak ditemukan.");

  const base = `${platformPrefix(suite.project.platform)}-${featurePrefixFromName(
    suite.name
  ).toLowerCase()}`;
  for (let attempt = 0; attempt < 20; attempt++) {
    const count = await prisma.testCase.count({
      where: { tcId: { startsWith: `${base}-` } },
    });
    const candidate = `${base}-${String(count + 1 + attempt).padStart(3, "0")}`;
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
    // TC ID bisa diubah manual; kosong = pertahankan yang lama. Normalisasi lowercase.
    const tcIdInput = String(formData.get("tcId") ?? "").trim().toLowerCase();
    const newTcId = tcIdInput || tc.tcId;
    const updated = await prisma.testCase.update({
      where: { id },
      data: {
        tcId: newTcId,
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

    if (newTcId !== tc.tcId) {
      await logActivity(id, "UPDATED", `TC ID berubah: ${tc.tcId} → ${newTcId}`, user.id);
    } else if (newStatus !== tc.status) {
      await logActivity(id, "STATUS_CHANGED", `Status berubah: ${tc.status} → ${newStatus}`, user.id);
    } else {
      await logActivity(id, "UPDATED", "Detail test case diperbarui", user.id);
    }
    revalidatePath(`/suites/${suiteId ?? tc.suiteId}`);
    return {
      success: true,
      testCase: { ...updated, createdAt: updated.createdAt.toISOString() },
    };
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

/* ------------------------- Import Test Case (wizard) ------------------------- */

/**
 * Satu baris siap-impor hasil mapping kolom file.
 * `testData` & `status` dipertahankan (opsional) supaya file lama yang masih
 * memakainya tidak kehilangan data — template baru tidak lagi memuat keduanya.
 */
export type ImportTestCaseRow = {
  /** Nama section target (opsional). Kosong = Tanpa Section. */
  section?: string;
  tcId?: string;
  title: string;
  priority?: string;
  scenario?: string;
  precondition?: string;
  expectedResult?: string;
  steps?: string;
  testData?: string;
  status?: string;
};

export type ImportTestCasesState = {
  error?: string;
  created?: number;
  /** Indeks (0-based, relatif terhadap array yang dikirim) baris yang gagal. */
  failedIndexes?: number[];
};

const PRIORITY_VALUES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
const STATUS_VALUES = ["DRAFT", "ACTIVE", "DEPRECATED"] as const;

function normalizePriority(value?: string): (typeof PRIORITY_VALUES)[number] {
  const v = (value ?? "").trim().toUpperCase();
  return (PRIORITY_VALUES as readonly string[]).includes(v)
    ? (v as (typeof PRIORITY_VALUES)[number])
    : "MEDIUM";
}

function normalizeStatus(value?: string): (typeof STATUS_VALUES)[number] {
  const v = (value ?? "").trim().toUpperCase();
  return (STATUS_VALUES as readonly string[]).includes(v)
    ? (v as (typeof STATUS_VALUES)[number])
    : "DRAFT";
}

/**
 * Cari section berdasarkan nama DI DALAM suite (case-insensitive) dan buat kalau
 * belum ada. `cache` dipegang per pemanggilan impor supaya satu nama section
 * tidak di-query/dibuat berulang kali untuk baris-baris berikutnya.
 */
async function ensureSectionId(
  suiteId: string,
  name: string,
  cache: Map<string, string>
): Promise<string> {
  const key = name.toLowerCase();
  const cached = cache.get(key);
  if (cached) return cached;

  const existing = await prisma.section.findFirst({
    where: { suiteId, name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) {
    cache.set(key, existing.id);
    return existing.id;
  }

  const count = await prisma.section.count({ where: { suiteId } });
  const created = await prisma.section.create({
    data: { suiteId, name, order: count },
    select: { id: true },
  });
  cache.set(key, created.id);
  return created.id;
}

/**
 * Impor banyak Test Case dari wizard import (CSV/XLSX).
 *
 * Aturan:
 * - `title` wajib; baris tanpa title dicatat sebagai gagal (index-nya dikembalikan).
 * - Field lain opsional — Description kosong disimpan sebagai null.
 * - Kolom `section` opsional: section dicari (case-insensitive) atau dibuat
 *   otomatis, lalu TC-nya langsung ditempatkan di section tersebut.
 */
export async function importTestCases(
  suiteId: string,
  rows: ImportTestCaseRow[]
): Promise<ImportTestCasesState> {
  const user = await requireRole("QA");
  const trimmedSuiteId = (suiteId ?? "").trim();
  if (!trimmedSuiteId) return { error: "Suite wajib diisi." };
  if (rows.length === 0) return { created: 0, failedIndexes: [] };

  try {
    const suite = await prisma.suite.findUnique({
      where: { id: trimmedSuiteId },
      select: { id: true },
    });
    if (!suite) return { error: "Suite tidak ditemukan." };

    const sectionCache = new Map<string, string>();
    const failedIndexes: number[] = [];
    let created = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const title = (row.title ?? "").trim();
      if (!title) {
        failedIndexes.push(i);
        continue;
      }

      try {
        const sectionName = (row.section ?? "").trim();
        const sectionId = sectionName
          ? await ensureSectionId(trimmedSuiteId, sectionName, sectionCache)
          : null;

        const tcId = await buildTcId(trimmedSuiteId, row.tcId);
        const tc = await prisma.testCase.create({
          data: {
            tcId,
            title,
            suiteId: trimmedSuiteId,
            sectionId,
            scenario: (row.scenario ?? "").trim() || null,
            precondition: (row.precondition ?? "").trim() || null,
            steps: (row.steps ?? "").trim() || null,
            testData: (row.testData ?? "").trim() || null,
            expectedResult: (row.expectedResult ?? "").trim() || null,
            priority: normalizePriority(row.priority),
            status: normalizeStatus(row.status),
            createdById: user.id,
          },
          select: { id: true },
        });
        await logActivity(tc.id, "CREATED", `Test case diimpor (${tcId})`, user.id);
        created++;
      } catch (error) {
        console.error(error);
        failedIndexes.push(i);
      }
    }

    revalidatePath(`/suites/${trimmedSuiteId}`);
    return { created, failedIndexes };
  } catch (error) {
    return handleError(error);
  }
}
