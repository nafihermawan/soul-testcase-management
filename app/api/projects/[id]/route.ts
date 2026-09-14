import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiSession, apiRoleAtLeast, json401, json404 } from "@/lib/api-auth";
import type { ProjectSuiteNode, ProjectTreePayload } from "@/types/api";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const user = await apiSession();
  if (!user) return json401();

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, code: true, platform: true },
  });

  if (!project) {
    return json404("Project tidak ditemukan.");
  }

  // Ambil SEMUA suite milik project sekali jalan, lalu susun tree di memory
  // berdasarkan parentId. Suite bersifat rekursif tanpa batas kedalaman
  // (PRD Section 4), jadi tidak ada level yang boleh di-hardcode.
  // findMany terurut (order, createdAt) -> urutan antar sibling tetap terjaga
  // karena anak didorong ke parent-nya sesuai urutan iterasi.
  const suites = await prisma.suite.findMany({
    where: { projectId: project.id },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      code: true,
      parentId: true,
      docUrl: true,
      updatedAt: true,
      _count: { select: { testCases: true } },
    },
  });

  const nodeById = new Map<string, ProjectSuiteNode>();
  for (const s of suites) {
    nodeById.set(s.id, {
      id: s.id,
      name: s.name,
      code: s.code,
      parentId: s.parentId,
      docUrl: s.docUrl,
      totalTestCases: s._count.testCases,
      updatedAt: s.updatedAt.toISOString(),
      children: [],
    });
  }

  const roots: ProjectSuiteNode[] = [];
  for (const s of suites) {
    const node = nodeById.get(s.id)!;
    const parent = s.parentId ? nodeById.get(s.parentId) : undefined;
    // parentId yang menunjuk suite di luar project ini (data tak terduga) tetap
    // ditampilkan sebagai root, supaya tidak ada suite yang hilang dari tree.
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  const payload: ProjectTreePayload = {
    project: { id: project.id, name: project.name, code: project.code, platform: project.platform },
    suites: roots,
    canEdit: apiRoleAtLeast(user.role, "QA"),
  };

  return NextResponse.json(payload);
}

export const dynamic = "force-dynamic";
