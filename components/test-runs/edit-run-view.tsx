"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ExpressRunForm, type ExpressRunInitial } from "@/components/test-runs/express-run";
import {
  ErrorBlock,
  FormCardSkeleton,
  HeaderDetailSkeleton,
  NotFoundBlock,
} from "@/components/ui/data-states";
import { useApi } from "@/lib/client/use-api";
import { useMe } from "@/lib/client/me-context";
import type { RunDetailPayload, RunOptionsPayload } from "@/types/api";

/**
 * Halaman Edit Run.
 *
 * Memakai ulang `ExpressRunForm` yang sama dengan halaman Create Express Run;
 * bedanya form diisi nilai awal dari run terpilih (mode="edit"), sehingga nama,
 * activity, environment, platform, sprint, task link, project, suite, dan TC
 * terpilih sudah ter-populate.
 */
export function EditRunView({ runId }: { runId: string }) {
  const router = useRouter();
  const { me, loading: meLoading } = useMe();
  const role = me?.role;
  const ready = !meLoading && !!me && role === "QA";

  // Hanya QA yang boleh mengubah run.
  useEffect(() => {
    if (me && role !== "QA") router.replace(`/test-runs/${runId}`);
  }, [me, role, router, runId]);

  const run = useApi<RunDetailPayload>(`/api/test-runs/${runId}`, { enabled: ready });
  const options = useApi<RunOptionsPayload>("/api/test-runs/options", { enabled: ready });

  // Nilai awal diturunkan dari run: field run + project/TC yang sudah terdaftar.
  const initial: ExpressRunInitial | null = useMemo(() => {
    if (!run.data) return null;
    const d = run.data;
    const projectIds = Array.from(
      new Set(
        [
          ...d.projects.map((p) => p.projectId),
          ...d.results.map((r) => r.testCase?.suite?.projectId).filter((x): x is string => !!x),
        ].filter(Boolean)
      )
    );
    return {
      name: d.runName,
      activityType: d.activityType ?? "",
      environment: d.environment ?? "",
      platforms: (d.platforms ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      sprint: d.sprint ?? "",
      taskLink: d.taskLink ?? "",
      projectIds,
      testCaseIds: d.results.map((r) => r.testCaseId),
    };
  }, [run.data]);

  if (!ready) {
    return (
      <main style={{ fontFamily: "var(--font-sans)", width: "100%" }}>
        <HeaderDetailSkeleton />
      </main>
    );
  }

  if (run.error?.status === 404) {
    return (
      <main style={{ fontFamily: "var(--font-sans)", width: "100%" }}>
        <NotFoundBlock title="Run tidak ditemukan" />
      </main>
    );
  }

  if (run.error) {
    return (
      <main style={{ fontFamily: "var(--font-sans)", width: "100%" }}>
        <ErrorBlock message={run.error.message} onRetry={run.reload} />
      </main>
    );
  }

  if (options.error) {
    return (
      <main style={{ fontFamily: "var(--font-sans)", width: "100%" }}>
        <ErrorBlock message={options.error.message} onRetry={options.reload} />
      </main>
    );
  }

  if (!run.data || !initial || !options.data) {
    return (
      <main style={{ fontFamily: "var(--font-sans)", width: "100%" }}>
        <HeaderDetailSkeleton />
        <FormCardSkeleton />
      </main>
    );
  }

  return (
    <main style={{ fontFamily: "var(--font-sans)", width: "100%" }}>
      {/* Header card: judul menyesuaikan mode edit */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
          flexWrap: "wrap",
          background: "#FFFFFF",
          borderRadius: 12,
          padding: "20px 24px",
          border: "1px solid #E5E7EB",
          boxShadow: "0px 1px 2px rgba(16, 24, 40, 0.04), 0px 4px 12px rgba(16, 24, 40, 0.06)",
          marginBottom: 20,
        }}
      >
        <h1
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: "#0F172A",
            margin: 0,
            lineHeight: 1.2,
            minWidth: 0,
          }}
        >
          Edit Test Run: {run.data.runName}
        </h1>
        <a
          href="/test-runs"
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "10px 16px",
            borderRadius: 8,
            border: "1px solid #D1D5DB",
            background: "#fff",
            color: "#374151",
            fontSize: 14,
            fontWeight: 600,
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
        >
          Batal
        </a>
      </div>

      {/* Card form — komponen yang sama dengan Create Express Run */}
      <div
        style={{
          background: "#FFFFFF",
          border: "1px solid #E5E7EB",
          borderRadius: 12,
          boxShadow: "0px 1px 2px rgba(16, 24, 40, 0.04), 0px 4px 12px rgba(16, 24, 40, 0.06)",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "1rem 1.25rem", borderBottom: "1px solid #E5E7EB" }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: "#0F172A" }}>Express Run</div>
          <p style={{ fontSize: 13, color: "#6B7280", margin: "0.25rem 0 0" }}>
            Ubah detail run atau sesuaikan suite/test case yang ikut dieksekusi.
          </p>
        </div>
        <ExpressRunForm
          projectId=""
          projects={options.data.projects}
          mode="edit"
          runId={runId}
          initial={initial}
        />
      </div>
    </main>
  );
}
