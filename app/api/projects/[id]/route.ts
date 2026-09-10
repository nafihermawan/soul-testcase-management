import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiSession, apiRoleAtLeast, json401, json404 } from "@/lib/api-auth";
import type { ProjectSuiteNode, ProjectTreePayload } from "@/types/api";

type SuiteWithCount = {
  id: string;
  name: string;
  code: string;
  parentId: string | null;
  docUrl: string | null;
  updatedAt: Date;
  _count: { testCases: number };
  children: Array<{
    id: string;
    name: string;
    code: string;
    parentId: string | null;
    docUrl: string | null;
    updatedAt: Date;
    _count: { testCases: number };
    children: Array<{
      id: string;
      name: string;
      code: string;
      parentId: string | null;
      docUrl: string | null;
      updatedAt: Date;
      _count: { testCases: number };
    }>;
  }>;
};

function toNode(s: SuiteWithCount): ProjectSuiteNode {
  return {
    id: s.id,
    name: s.name,
    code: s.code,
    parentId: s.parentId,
    docUrl: s.docUrl,
    totalTestCases: s._count.testCases,
    updatedAt: s.updatedAt.toISOString(),
    children: s.children.map((c) => ({
      id: c.id,
      name: c.name,
      code: c.code,
      parentId: c.parentId,
      docUrl: c.docUrl,
      totalTestCases: c._count.testCases,
      updatedAt: c.updatedAt.toISOString(),
      children: c.children.map((g) => ({
        id: g.id,
        name: g.name,
        code: g.code,
        parentId: g.parentId,
        docUrl: g.docUrl,
        totalTestCases: g._count.testCases,
        updatedAt: g.updatedAt.toISOString(),
        children: [],
      })),
    })),
  };
}

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const user = await apiSession();
  if (!user) return json401();

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: {
      suites: {
        where: { parentId: null },
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
        include: {
          _count: { select: { testCases: true } },
          children: {
            orderBy: [{ order: "asc" }, { createdAt: "asc" }],
            include: {
              _count: { select: { testCases: true } },
              children: {
                orderBy: [{ order: "asc" }, { createdAt: "asc" }],
                include: {
                  _count: { select: { testCases: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!project) {
    return json404("Project tidak ditemukan.");
  }

  const suites: ProjectSuiteNode[] = project.suites.map((s) => toNode(s as unknown as SuiteWithCount));

  const payload: ProjectTreePayload = {
    project: { id: project.id, name: project.name, code: project.code, platform: project.platform },
    suites,
    canEdit: apiRoleAtLeast(user.role, "QA"),
  };

  return NextResponse.json(payload);
}

export const dynamic = "force-dynamic";
