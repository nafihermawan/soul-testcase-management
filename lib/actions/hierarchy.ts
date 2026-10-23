"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/permissions";
import { platformPrefix } from "@/lib/format";
import { ACTIVE_BUG_STATUSES } from "@/lib/qa-metrics";

export type HierarchyActionState = {
  error?: string;
  success?: boolean;
  suite?: {
    id: string;
    name: string;
    code: string;
    docUrl: string | null;
    updatedAt: string;
  };
};

function handleError(error: unknown): HierarchyActionState {
  console.error(error);
  if (error instanceof Error && error.message.includes("Unique constraint")) {
    return { error: "Kode sudah dipakai untuk level ini, gunakan kode lain." };
  }
  return { error: "Terjadi kesalahan. Coba lagi." };
}

/* ------------------------- Project (top-level) ------------------------- */

const PLATFORM_VALUES = ["MOBILE", "WEB", "HARDWARE", "API"] as const;
type PlatformValue = (typeof PLATFORM_VALUES)[number];

function toPlatform(raw: string): PlatformValue | null {
  const v = raw.trim().toUpperCase();
  return (PLATFORM_VALUES as readonly string[]).includes(v)
    ? (v as PlatformValue)
    : null;
}

export async function createProject(formData: FormData): Promise<HierarchyActionState> {
  await requireRole("QA");
  const name = String(formData.get("name") ?? "").trim();
  const code = String(formData.get("code") ?? "")
    .trim()
    .toLowerCase();
  const description = String(formData.get("description") ?? "").trim();
  const docUrl = String(formData.get("docUrl") ?? "").trim();
  if (!name || !code) return { error: "Nama dan kode wajib diisi." };

  try {
    await prisma.project.create({
      data: {
        name,
        code,
        description: description || null,
        platform: toPlatform(String(formData.get("platform") ?? "")),
        docUrl: docUrl || null,
      },
    });
    revalidatePath("/");
    revalidatePath("/settings");
    return { success: true };
  } catch (error) {
    return handleError(error);
  }
}

export async function updateProject(formData: FormData): Promise<HierarchyActionState> {
  await requireRole("QA");
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const code = String(formData.get("code") ?? "")
    .trim()
    .toLowerCase();
  const description = String(formData.get("description") ?? "").trim();
  const docUrl = String(formData.get("docUrl") ?? "").trim();
  if (!id || !name || !code) return { error: "Nama dan kode wajib diisi." };

  try {
    await prisma.project.update({
      where: { id },
      data: {
        name,
        code,
        description: description || null,
        platform: toPlatform(String(formData.get("platform") ?? "")),
        docUrl: docUrl || null,
      },
    });
    revalidatePath("/");
    revalidatePath("/settings");
    return { success: true };
  } catch (error) {
    return handleError(error);
  }
}

export async function deleteProject(formData: FormData): Promise<void> {
  await requireRole("QA");
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  try {
    await prisma.project.delete({ where: { id } });
    revalidatePath("/");
    revalidatePath("/settings");
  } catch (error) {
    console.error(error);
  }
}

export async function reorderProjects(orderedIds: string[]): Promise<void> {
  await requireRole("QA");
  try {
    await prisma.$transaction(
      orderedIds.map((id, index) =>
        prisma.project.update({ where: { id }, data: { order: index } })
      )
    );
    revalidatePath("/");
    revalidatePath("/settings");
  } catch (error) {
    console.error(error);
  }
}

/* ------------------------- Suite (rekursif) ------------------------- */

/** Pastikan kode suite diawali prefix platform project-nya (idempotent).
 *  Contoh: WEB + "ovrtm" -> "web-ovrtm"; kode yang sudah berprefix dibiarkan. */
async function suiteCodeWithPlatformPrefix(projectId: string, code: string): Promise<string> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { platform: true },
  });
  const prefix = platformPrefix(project?.platform);
  const clean = code.trim().toLowerCase();
  return clean.startsWith(`${prefix}-`) ? clean : `${prefix}-${clean}`;
}

export async function createSuite(formData: FormData): Promise<HierarchyActionState> {
  await requireRole("QA");
  const projectId = String(formData.get("projectId") ?? "");
  const parentId = String(formData.get("parentId") ?? "").trim() || null;
  const name = String(formData.get("name") ?? "").trim();
  const code = String(formData.get("code") ?? "")
    .trim()
    .toLowerCase();
  const docUrl = String(formData.get("docUrl") ?? "").trim();
  if (!projectId || !name || !code) return { error: "Nama dan kode wajib diisi." };

  try {
    const finalCode = await suiteCodeWithPlatformPrefix(projectId, code);
    const count = await prisma.suite.count({
      where: parentId ? { parentId } : { parentId: null, projectId },
    });
    await prisma.suite.create({
      data: { projectId, parentId, name, code: finalCode, docUrl: docUrl || null, order: count },
    });
    revalidatePath("/");
    revalidatePath("/settings");
    return { success: true };
  } catch (error) {
    return handleError(error);
  }
}

export async function updateSuite(formData: FormData): Promise<HierarchyActionState> {
  await requireRole("QA");
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const code = String(formData.get("code") ?? "")
    .trim()
    .toLowerCase();
  const docUrl = String(formData.get("docUrl") ?? "").trim();
  if (!id || !name || !code) return { error: "Nama dan kode wajib diisi." };

  try {
    const existing = await prisma.suite.findUnique({
      where: { id },
      select: { projectId: true },
    });
    if (!existing) return { error: "Suite tidak ditemukan." };
    const finalCode = await suiteCodeWithPlatformPrefix(existing.projectId, code);
    const updated = await prisma.suite.update({
      where: { id },
      data: { name, code: finalCode, docUrl: docUrl || null },
      select: { id: true, name: true, code: true, docUrl: true, updatedAt: true },
    });
    revalidatePath("/");
    revalidatePath("/settings");
    return { success: true, suite: { ...updated, updatedAt: updated.updatedAt.toISOString() } };
  } catch (error) {
    return handleError(error);
  }
}

/**
 * Pemakaian Suite oleh bug — dipakai UI untuk memutuskan antara toast error
 * (masih ada bug AKTIF) atau modal konfirmasi (cuma riwayat bug Closed).
 */
export async function suiteBugUsage(
  suiteId: string
): Promise<{ error?: string; active?: number; closed?: number }> {
  await requireRole("QA");
  if (!suiteId) return { error: "Suite tidak ditemukan." };
  try {
    const [active, closed] = await Promise.all([
      prisma.bug.count({ where: { suiteId, status: { in: [...ACTIVE_BUG_STATUSES] } } }),
      prisma.bug.count({ where: { suiteId, status: { notIn: [...ACTIVE_BUG_STATUSES] } } }),
    ]);
    return { active, closed };
  } catch (error) {
    console.error(error);
    return { error: "Gagal memeriksa pemakaian suite." };
  }
}

export async function deleteSuite(formData: FormData): Promise<{ error?: string }> {
  await requireRole("QA");
  const id = String(formData.get("id") ?? "");
  if (!id) return {};
  try {
    const suite = await prisma.suite.findUnique({ where: { id }, select: { name: true } });
    if (!suite) return { error: "Suite tidak ditemukan." };

    // Hanya bug AKTIF yang boleh memblokir. Bug CLOSED/RESOLVED — termasuk yang
    // berada di Test Run COMPLETED dan tak bisa dipindah lagi — adalah riwayat,
    // jadi jangan sampai membuat deadlock penghapusan.
    const activeBugs = await prisma.bug.count({
      where: { suiteId: id, status: { in: [...ACTIVE_BUG_STATUSES] } },
    });
    if (activeBugs > 0) {
      return {
        error: `Suite ini masih dipakai oleh ${activeBugs} bug aktif. Selesaikan atau pindahkan bug-nya dulu.`,
      };
    }

    await prisma.$transaction([
      // Snapshot nama suite ke bug riwayat SEBELUM FK-nya di-SetNull oleh delete,
      // supaya kolom Module tidak berubah jadi "—".
      prisma.bug.updateMany({ where: { suiteId: id }, data: { suiteName: suite.name } }),
      prisma.suite.delete({ where: { id } }),
    ]);
    revalidatePath("/");
    revalidatePath("/settings");
    revalidatePath("/bugs");
    return {};
  } catch (error) {
    console.error(error);
    return { error: "Gagal menghapus suite." };
  }
}

export async function reorderSuites(parentId: string | null, orderedIds: string[]): Promise<void> {
  await requireRole("QA");
  try {
    await prisma.$transaction(
      orderedIds.map((id, index) => prisma.suite.update({ where: { id }, data: { order: index } }))
    );
    revalidatePath("/");
    revalidatePath("/settings");
  } catch (error) {
    console.error(error);
  }
}

/** Pindahkan Suite ke parent lain (reparent), termasuk antar proyek. */
export async function moveSuite(
  suiteId: string,
  newParentId: string | null
): Promise<{ error?: string; success?: boolean }> {
  await requireRole("QA");
  if (!suiteId) return { error: "Suite tidak ditemukan." };
  if (newParentId === suiteId) return { error: "Suite tidak bisa dipindah ke dirinya sendiri." };

  try {
    const suite = await prisma.suite.findUnique({ where: { id: suiteId } });
    if (!suite) return { error: "Suite tidak ditemukan." };

    let projectId = suite.projectId;
    if (newParentId) {
      const parent = await prisma.suite.findUnique({ where: { id: newParentId } });
      if (!parent) return { error: "Parent suite tidak ditemukan." };
      projectId = parent.projectId;
    }

    const count = await prisma.suite.count({
      where: newParentId ? { parentId: newParentId } : { parentId: null, projectId },
    });
    await prisma.suite.update({
      where: { id: suiteId },
      data: { projectId, parentId: newParentId, order: count },
    });
    revalidatePath("/");
    revalidatePath("/settings");
    return { success: true };
  } catch (error) {
    console.error(error);
    return { error: "Terjadi kesalahan. Coba lagi." };
  }
}
