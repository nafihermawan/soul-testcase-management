"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AutomationPageClient } from "@/components/automation/automation-page-client";
import {
  ErrorBlock,
  StatsCardsSkeleton,
  TableCardSkeleton,
} from "@/components/ui/data-states";
import { useApi } from "@/lib/client/use-api";
import { useMe } from "@/lib/client/me-context";
import type { AutomationPayload } from "@/types/api";

export default function AutomationPage() {
  const router = useRouter();
  const { me, loading: meLoading } = useMe();
  const role = me?.role;
  const blocked = !!me && role === "PRODUCT";

  // Role PRODUCT tidak berhak melihat halaman automation.
  useEffect(() => {
    if (blocked) router.replace("/");
  }, [blocked, router]);

  // Payload langsung diminta tanpa menunggu role; server tetap menolak (403)
  // bila role tidak berhak, dan halaman mengalihkan user.
  const { data, error, loading, reload } = useApi<AutomationPayload>("/api/automation");

  return (
    <main style={{ fontFamily: "var(--font-sans, system-ui, sans-serif)", width: "100%" }}>
      {meLoading || !me || blocked ? (
        <TableCardSkeleton />
      ) : error ? (
        <ErrorBlock message={error.message} onRetry={reload} />
      ) : loading || !data ? (
        <>
          <StatsCardsSkeleton count={4} />
          <div style={{ height: "1.25rem" }} />
          <TableCardSkeleton />
        </>
      ) : (
        <AutomationPageClient
          canManage={role === "QA"}
          canUpdateStatus={role === "QA" || role === "DEVELOPER"}
          projects={data.projects}
          suitesByProject={data.suitesByProject}
          rows={data.rows}
          projectStats={data.projectStats}
          reload={reload}
        />
      )}
    </main>
  );
}
