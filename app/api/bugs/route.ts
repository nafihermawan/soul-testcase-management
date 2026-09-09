import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiSession, json401 } from "@/lib/api-auth";
import type { BugsPayload, BugRow } from "@/types/api";

export async function GET() {
  const user = await apiSession();
  if (!user) return json401();

  const bugs = await prisma.bug.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      testCase: { select: { id: true, tcId: true, title: true } },
      createdBy: { select: { name: true } },
    },
  });

  const rows: BugRow[] = bugs.map((b) => ({
    id: b.id,
    title: b.title,
    description: b.description,
    status: b.status,
    severity: b.severity,
    externalLink: b.externalLink,
    createdAt: b.createdAt.toISOString(),
    testCase: b.testCase,
    createdBy: b.createdBy,
  }));

  return NextResponse.json({ bugs: rows } satisfies BugsPayload);
}

export const dynamic = "force-dynamic";
