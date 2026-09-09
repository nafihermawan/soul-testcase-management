import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiSession, apiRoleAtLeast, json401, json403 } from "@/lib/api-auth";
import type { RunOptionsPayload, RunOptionSuite, RunOptionTestCase } from "@/types/api";

export async function GET() {
  const user = await apiSession();
  if (!user) return json401();
  // Hanya QA yang dapat membuat Express Run.
  if (!apiRoleAtLeast(user.role, "QA")) return json403("Hanya QA yang dapat membuat Express Run.");

  const projects = await prisma.project.findMany({
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: { id: true, name: true },
  });

  const suites = await prisma.suite.findMany({
    select: { id: true, name: true, code: true, projectId: true, parentId: true },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });
  // Bangun path label sederhana: code parent > code
  const suitePath = new Map<string, string>();
  const pathOf = (id: string): string => {
    const cached = suitePath.get(id);
    if (cached) return cached;
    const s = suites.find((x) => x.id === id);
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

  const testCases = await prisma.testCase.findMany({
    select: { id: true, tcId: true, title: true, suiteId: true },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });
  const suiteProject = new Map(suites.map((s) => [s.id, s.projectId]));
  const tcOptions: RunOptionTestCase[] = testCases.map((t) => ({
    id: t.id,
    tcId: t.tcId,
    title: t.title,
    suiteName: t.suiteId ? pathOf(t.suiteId) : "",
    suiteId: t.suiteId ?? null,
    projectId: t.suiteId ? (suiteProject.get(t.suiteId) ?? null) : null,
  }));

  const payload: RunOptionsPayload = { projects, suites: suiteOptions, testCases: tcOptions };
  return NextResponse.json(payload);
}

export const dynamic = "force-dynamic";
