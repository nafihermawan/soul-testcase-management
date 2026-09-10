"use client";

import { RunExecutor } from "@/components/test-runs/run-executor";
import { ErrorBlock, NotFoundBlock, SuiteSkeleton } from "@/components/ui/data-states";
import { RefreshContext } from "@/lib/client/refresh-context";
import { useApi } from "@/lib/client/use-api";
import type { RunDetailPayload } from "@/types/api";

export function RunDetailView({ runId }: { runId: string }) {
  const { data, error, loading, reload } = useApi<RunDetailPayload>(`/api/test-runs/${runId}`);

  if (error?.status === 404) {
    return (
      <main style={{ fontFamily: "var(--font-sans)", width: "100%" }}>
        <NotFoundBlock title="Test run tidak ditemukan" />
      </main>
    );
  }

  if (error) {
    return (
      <main style={{ fontFamily: "var(--font-sans)", width: "100%" }}>
        <ErrorBlock message={error.message} onRetry={reload} />
      </main>
    );
  }

  if (loading || !data) {
    return (
      <main style={{ fontFamily: "var(--font-sans)", width: "100%" }}>
        <SuiteSkeleton />
      </main>
    );
  }

  return (
    <main style={{ fontFamily: "var(--font-sans)", width: "100%" }}>
      <RefreshContext.Provider value={reload}>
        <RunExecutor
          runId={data.runId}
          runName={data.runName}
          isCompleted={data.isCompleted}
          canEdit={data.canEdit}
          results={data.results}
          projects={data.projects}
          createdAt={new Date(data.createdAt)}
          completedAt={data.completedAt ? new Date(data.completedAt) : null}
          qaName={data.qaName}
          sprint={data.sprint}
          taskLink={data.taskLink}
          activityType={data.activityType}
          platforms={data.platforms}
          environment={data.environment}
          suites={data.suites}
        />
      </RefreshContext.Provider>
    </main>
  );
}
