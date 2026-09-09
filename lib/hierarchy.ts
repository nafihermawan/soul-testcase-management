import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function requireUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }
  return session.user;
}

export async function getProjectWithSuites(projectId: string) {
  return prisma.project.findUnique({
    where: { id: projectId },
    include: {
      suites: {
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
        include: {
          children: {
            orderBy: [{ order: "asc" }, { createdAt: "asc" }],
            include: {
              children: {
                orderBy: [{ order: "asc" }, { createdAt: "asc" }],
              },
            },
          },
        },
      },
    },
  });
}
