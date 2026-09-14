import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiSession, apiRoleAtLeast, json401, json403 } from "@/lib/api-auth";
import type { RunOptionsPayload, RunOptionSuite, RunOptionTestCase } from "@/types/api";

/**
 * GET /api/test-runs/options
 * - tanpa `projectId`  -> hanya daftar project (pemilih project di form).
 * - dengan `projectId` -> hanya suite + test case milik project tersebut.
 *
 * Dipisah begini supaya form Express Run tidak menarik SELURUH test case
 * repository sekaligus (dulu ~78 KB untuk 331 TC). Lihat
 * docs/AUDIT-Performa-Navigasi.md §6.
 */
export async function GET(req: NextRequest) {
  const user = await apiSession();
  if (!user) return json401();
  // Hanya QA yang dapat membuat Express Run.
  if (!apiRoleAtLeast(user.role, "QA")) return json403("Hanya QA yang dapat membuat Express Run.");

  const projectId = (req.nextUrl.searchParams.get("projectId") ?? "").trim();

  // Tanpa projectId: cukup daftar project untuk dropdown.
  if (!projectId) {
    const projects = await prisma.project.findMany({
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true },
    });
    return NextResponse.json({
      projects,
      suites: [],
      testCases: [],
    } satisfies RunOptionsPayload);
  }

  // Dengan projectId: hanya suite & TC project itu (independen -> paralel).
  const [suites, testCases] = await Promise.all([
    prisma.suite.findMany({
      where: { projectId },
      select: { id: true, name: true, code: true, projectId: true, parentId: true },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    }),
    prisma.testCase.findMany({
      where: { suite: { is: { projectId } } },
      select: { id: true, tcId: true, title: true, suiteId: true },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    }),
  ]);

  // Bangun path label sederhana: code parent > code
  const suiteById = new Map(suites.map((s) => [s.id, s]));
  const suitePath = new Map<string, string>();
  const pathOf = (id: string): string => {
    const cached = suitePath.get(id);
    if (cached) return cached;
    const s = suiteById.get(id);
    if (!s) return "";
    const path = s.parentId ? `${pathOf(s.parentId)} > ${s.name}` : s.name;
    suitePath.set(id, path);
    return path;
  };
  const suiteOptions: RunOptionSuite[] = suites.map((s) => ({
    id: s.id,
    name: s.name,
    code: s.code,
    path: pathOf(s.id),
    projectId: s.projectId,
  }));

  const suiteProject = new Map(suites.map((s) => [s.id, s.projectId]));
  const tcOptions: RunOptionTestCase[] = testCases.map((t) => ({
    id: t.id,
    tcId: t.tcId,
    title: t.title,
    suiteName: t.suiteId ? pathOf(t.suiteId) : "",
    suiteId: t.suiteId ?? null,
    projectId: t.suiteId ? (suiteProject.get(t.suiteId) ?? null) : null,
  }));

  return NextResponse.json({
    projects: [],
    suites: suiteOptions,
    testCases: tcOptions,
  } satisfies RunOptionsPayload);
}

export const dynamic = "force-dynamic";
