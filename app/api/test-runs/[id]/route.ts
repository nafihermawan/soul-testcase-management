import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiSession, apiRoleAtLeast, json401, json404 } from "@/lib/api-auth";
import { toAttachmentItems } from "@/lib/attachments";
import type { RunDetailPayload, RunResultItem } from "@/types/api";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const user = await apiSession();
  if (!user) return json401();

  const run = await prisma.testRun.findUnique({
    where: { id: params.id },
    include: {
      project: { select: { id: true, name: true } },
      createdBy: { select: { name: true } },
      results: {
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          status: true,
          titleSnapshot: true,
          actualResult: true,
          notes: true,
          testCaseId: true,
          bugs: {
            select: {
              id: true,
              title: true,
              severity: true,
              status: true,
              externalLink: true,
            },
            orderBy: { createdAt: "asc" },
          },
          attachments: {
            orderBy: { createdAt: "desc" },
            include: { uploadedBy: { select: { name: true } } },
          },
          testCase: {
            select: {
              id: true,
              tcId: true,
              title: true,
              priority: true,
              status: true,
              scenario: true,
              precondition: true,
              steps: true,
              expectedResult: true,
              createdAt: true,
              suite: {
                select: {
                  id: true,
                  name: true,
                  projectId: true,
                  project: { select: { name: true } },
                },
              },
              createdBy: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  if (!run) {
    return json404("Test run tidak ditemukan.");
  }

  const results: RunResultItem[] = await Promise.all(
    run.results.map(async (r) => ({
      id: r.id,
      status: r.status,
      titleSnapshot: r.titleSnapshot,
      actualResult: r.actualResult,
      notes: r.notes,
      testCaseId: r.testCaseId,
      bugs: r.bugs.map((b) => ({
        id: b.id,
        title: b.title,
        severity: b.severity,
        status: b.status,
        externalLink: b.externalLink,
      })),
      attachments: await toAttachmentItems(r.attachments),
      testCase: r.testCase
        ? {
            id: r.testCase.id,
            tcId: r.testCase.tcId,
            title: r.testCase.title,
            priority: r.testCase.priority,
            status: r.testCase.status,
            scenario: r.testCase.scenario,
            precondition: r.testCase.precondition,
            steps: r.testCase.steps,
            expectedResult: r.testCase.expectedResult,
            createdAt: r.testCase.createdAt.toISOString(),
            suite: r.testCase.suite,
            createdBy: r.testCase.createdBy,
          }
        : null,
    }))
  );

  // Suite unik yang terlibat dalam run ini (dari test case yang dieksekusi)
  const suites = Array.from(
    new Map(
      run.results
        .map((r) => r.testCase?.suite)
        .filter(
          (s): s is { id: string; name: string; projectId: string; project: { name: string } } =>
            !!s
        )
        .map((s) => [s.id, s])
    ).values()
  );

  // Grouping per project: id project -> { projectId, projectName, suites, items }
  const projectMap = new Map<string, RunDetailPayload["projects"][number]>();
  for (const item of results) {
    const suite = item.testCase?.suite;
    const projectId = suite?.projectId;
    if (!projectId) continue;
    const entry = projectMap.get(projectId) ?? {
      projectId,
      projectName: suite?.project?.name ?? "Unknown",
      suites: [],
      items: [],
    };
    entry.items.push(item);
    if (suite && !entry.suites.includes(suite.name)) entry.suites.push(suite.name);
    projectMap.set(projectId, entry);
  }
  const projects = Array.from(projectMap.values());

  const payload: RunDetailPayload = {
    runId: run.id,
    runName: run.name,
    isCompleted: run.status === "COMPLETED",
    canEdit: apiRoleAtLeast(user.role, "QA"),
    results,
    projects,
    createdAt: run.createdAt.toISOString(),
    completedAt: run.completedAt ? run.completedAt.toISOString() : null,
    qaName: run.createdBy?.name ?? null,
    sprint: run.sprint ?? null,
    taskLink: run.taskLink ?? null,
    activityType: run.activityType ?? null,
    platforms: run.platforms ?? null,
    environment: run.environment ?? null,
    suites: suites.map((s) => ({ id: s.id, name: s.name })),
  };

  return NextResponse.json(payload);
}

export const dynamic = "force-dynamic";
