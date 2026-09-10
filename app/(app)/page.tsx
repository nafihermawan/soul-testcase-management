"use client";

import { Dashboard } from "@/components/dashboard/dashboard";
import {
  ErrorBlock,
  StatsCardsSkeleton,
  TableCardSkeleton,
} from "@/components/ui/data-states";
import { useApi } from "@/lib/client/use-api";
import type { DashboardPayload } from "@/types/api";

export default function Home() {
  const { data, error, loading, reload } = useApi<DashboardPayload>("/api/dashboard");

  if (error) {
    return (
      <main style={{ fontFamily: "var(--font-sans, system-ui, sans-serif)", width: "100%" }}>
        <ErrorBlock message={error.message} onRetry={reload} />
      </main>
    );
  }

  if (loading || !data) {
    return (
      <main style={{ fontFamily: "var(--font-sans, system-ui, sans-serif)", width: "100%" }}>
        <StatsCardsSkeleton count={3} />
        <div style={{ height: "1.25rem" }} />
        <TableCardSkeleton />
      </main>
    );
  }

  return (
    <main style={{ fontFamily: "var(--font-sans, system-ui, sans-serif)", width: "100%" }}>
      <Dashboard
        user={data.user}
        projectMetrics={data.projectMetrics}
        runs={data.runs}
        bugs={data.bugs}
        suiteCoverage={data.suiteCoverage}
      />
    </main>
  );
}
