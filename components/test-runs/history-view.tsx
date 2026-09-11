"use client";

import { useMemo } from "react";
import { HistoryRunRow } from "@/components/test-runs/history-run-row";
import { HistoryControls } from "@/components/test-runs/history-controls";
import { HistoryPagination } from "@/components/test-runs/history-pagination";
import { DeleteRunButton } from "@/components/test-runs/delete-run-button";
import { ErrorBlock, TableCardSkeleton } from "@/components/ui/data-states";
import { useApi } from "@/lib/client/use-api";
import type { HistoryPayload } from "@/types/api";

export type HistorySearchParams = {
  project?: string;
  q?: string;
  platforms?: string;
  projects?: string;
  /** Rentang bulan "YYYY-MM". */
  from?: string;
  to?: string;
  /** Urutan tabel. Default: completed_at desc. */
  sort_by?: string;
  order?: string;
  page?: string;
  perPage?: string;
};

export function HistoryView({ searchParams }: { searchParams: HistorySearchParams }) {
  // Bangun URL API 1:1 dari query string halaman saat ini.
  const apiPath = useMemo(() => {
    const sp = new URLSearchParams();
    if (searchParams.q) sp.set("q", searchParams.q);
    if (searchParams.platforms) sp.set("platforms", searchParams.platforms);
    if (searchParams.projects) sp.set("projects", searchParams.projects);
    if (searchParams.project) sp.set("project", searchParams.project);
    if (searchParams.from) sp.set("from", searchParams.from);
    if (searchParams.to) sp.set("to", searchParams.to);
    if (searchParams.page) sp.set("page", searchParams.page);
    if (searchParams.perPage) sp.set("perPage", searchParams.perPage);
    // Urutan default: run terbaru selesai di atas.
    sp.set("sort_by", searchParams.sort_by ?? "completed_at");
    sp.set("order", searchParams.order ?? "desc");
    const qs = sp.toString();
    return `/api/test-runs/history${qs ? `?${qs}` : ""}`;
  }, [searchParams]);

  const { data, error, loading, reload } = useApi<HistoryPayload>(apiPath);

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
        <TableCardSkeleton />
      </main>
    );
  }

  const { runs, total, page, perPage, activeCount, allProjects, canDelete } = data;
  const initial = {
    q: searchParams.q ?? "",
    platforms: (searchParams.platforms ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    projectIds: ((searchParams.projects ?? "").split(",").map((s) => s.trim()).filter(Boolean)),
    from: searchParams.from ?? null,
    to: searchParams.to ?? null,
  };
  // Parameter lama `project` tunggal juga dianggap filter project aktif.
  if (searchParams.project) {
    initial.projectIds = [searchParams.project, ...initial.projectIds.filter((p) => p !== searchParams.project)];
  }

  return (
    <main style={{ fontFamily: "var(--font-sans)", width: "100%" }}>
      {/* Header Card Banner */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
          flexWrap: "wrap",
          background: "#FFFFFF",
          borderRadius: 12,
          border: "1px solid #E5E7EB",
          boxShadow: "0px 1px 2px rgba(16, 24, 40, 0.04), 0px 4px 12px rgba(16, 24, 40, 0.06)",
          padding: "20px 24px",
          marginBottom: 20,
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: "#0F172A",
              margin: 0,
              lineHeight: 1.2,
            }}
          >
            Run History
          </h1>
          <p
            style={{
              fontSize: 13,
              color: "#64748B",
              margin: "4px 0 0",
            }}
          >
          </p>
        </div>

        <HistoryControls
          projects={allProjects}
          initial={initial}
          activeCount={activeCount}
        />
      </div>

      <div
        style={{
          background: "#FFFFFF",
          border: "1px solid #E5E7EB",
          borderRadius: 12,
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)",
          overflow: "hidden",
        }}
      >
        {runs.length === 0 ? (
          <div style={{ padding: "3rem 1.5rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.9rem" }}>
            Tidak ada run yang cocok dengan filter / pencarian.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
              <thead>
                <tr style={{ background: "#F8FAFC", borderBottom: "1px solid #E2E8F0" }}>
                  <th style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#64748B", padding: "14px 16px", textAlign: "left" }}>
                    ID
                  </th>
                  <th style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#64748B", padding: "14px 16px", textAlign: "left" }}>
                    Run Name
                  </th>
                  <th style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#64748B", padding: "14px 16px", textAlign: "left" }}>
                    Projects Covered
                  </th>
                  <th style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#64748B", padding: "14px 16px", textAlign: "left" }}>
                    Suites Included
                  </th>
                  <th style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#64748B", padding: "14px 16px", textAlign: "left" }}>
                    Platform
                  </th>
                  <th style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#64748B", padding: "14px 16px", textAlign: "left" }}>
                    Sprint
                  </th>
                  <th style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#64748B", padding: "14px 16px", textAlign: "left" }}>
                    QA
                  </th>
                  <th style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#64748B", padding: "14px 16px", textAlign: "left" }}>
                    Execution Date
                  </th>
                  <th style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#64748B", padding: "14px 16px", textAlign: "right" }}>
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <HistoryRunRow
                    key={run.id}
                    {...run}
                    extraAction={
                      canDelete ? (
                        <DeleteRunButton runId={run.id} runName={run.name} onDeleted={reload} />
                      ) : undefined
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination footer */}
        <HistoryPagination total={total} page={page} perPage={perPage} baseUrl="/test-runs/history" />
      </div>
    </main>
  );
}
