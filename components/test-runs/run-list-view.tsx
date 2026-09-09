"use client";

import { useMemo } from "react";
import { TestRunRow } from "@/components/test-runs/test-run-row";
import { CreateRunButton } from "@/components/test-runs/create-run-button";
import { DeleteRunButton } from "@/components/test-runs/delete-run-button";
import { HistoryControls } from "@/components/test-runs/history-controls";
import { HistoryPagination } from "@/components/test-runs/history-pagination";
import { ErrorBlock, LoadingBlock } from "@/components/ui/data-states";
import { useApi } from "@/lib/client/use-api";
import type { ActiveRunsPayload } from "@/types/api";

export type ActiveRunsSearchParams = {
  q?: string;
  platforms?: string;
  projects?: string;
  project?: string;
  page?: string;
  perPage?: string;
};

export function RunListView({ searchParams }: { searchParams: ActiveRunsSearchParams }) {
  const apiPath = useMemo(() => {
    const sp = new URLSearchParams();
    if (searchParams.q) sp.set("q", searchParams.q);
    if (searchParams.platforms) sp.set("platforms", searchParams.platforms);
    if (searchParams.projects) sp.set("projects", searchParams.projects);
    if (searchParams.project) sp.set("project", searchParams.project);
    if (searchParams.page) sp.set("page", searchParams.page);
    if (searchParams.perPage) sp.set("perPage", searchParams.perPage);
    const qs = sp.toString();
    return `/api/test-runs${qs ? `?${qs}` : ""}`;
  }, [searchParams]);

  const { data, error, loading, reload } = useApi<ActiveRunsPayload>(apiPath);

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
        <LoadingBlock label="Memuat active runs…" />
      </main>
    );
  }

  const { runs, total, page, perPage, allProjects } = data;

  const hasFilter = !!(searchParams.q || searchParams.platforms || searchParams.projects || searchParams.project);
  const projectIds = (searchParams.projects ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (searchParams.project && !projectIds.includes(searchParams.project)) {
    projectIds.unshift(searchParams.project);
  }

  return (
    <main style={{ fontFamily: "var(--font-sans)", width: "100%" }}>
      {/* Satu card utama: header halaman + tabel */}
      <div
        style={{
          background: "#fff",
          border: "1px solid rgba(226, 232, 240, 0.8)",
          borderRadius: 16,
          boxShadow: "0 1px 3px rgba(15, 23, 42, 0.06)",
          overflow: "hidden",
        }}
      >
        {/* Area header (Active Runs + kontrol) */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
            flexWrap: "wrap",
            padding: "1.25rem 1.5rem",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: "#0F172A",
                margin: 0,
                lineHeight: 1.2,
              }}
            >
              Active Runs
            </h1>
            <p style={{ fontSize: 13, color: "#64748B", margin: "4px 0 0" }}>
              Test run yang sedang berjalan (In Progress).
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            <HistoryControls
              projects={allProjects}
              baseUrl="/test-runs"
              dialogTitle="Filter Active Runs"
              initial={{
                q: searchParams.q ?? "",
                platforms: (searchParams.platforms ?? "")
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
                projectIds,
              }}
              activeCount={(searchParams.platforms ? 1 : 0) + (projectIds.length > 0 ? 1 : 0)}
            />
            {data.canEdit && <CreateRunButton />}
          </div>
        </div>

        {/* Konten tabel / empty state */}
        {runs.length === 0 ? (
          hasFilter ? (
            <div
              style={{
                borderTop: "1px solid #E2E8F0",
                padding: "3rem 1.5rem",
                textAlign: "center",
                color: "var(--text-muted)",
                fontSize: "0.9rem",
              }}
            >
              Tidak ada run berjalan yang cocok dengan filter / pencarian.
            </div>
          ) : (
            <div
              style={{
                borderTop: "1px solid #E2E8F0",
                padding: "3rem 1.5rem",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                textAlign: "center",
                gap: "0.5rem",
              }}
            >
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: "50%",
                  background: "var(--surface-muted)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--text-muted)",
                  marginBottom: "0.25rem",
                }}
              >
                <svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              </div>
              <div style={{ fontSize: "1rem", fontWeight: 700 }}>Belum Ada Run Berjalan</div>
              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", maxWidth: 380, margin: 0 }}>
                Klik &ldquo;+ Express Run&rdquo; untuk membuat run baru. Run yang sudah selesai otomatis
                pindah ke History.
              </p>
            </div>
          )
        ) : (
          <div style={{ overflowX: "auto", borderTop: "1px solid #E2E8F0" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
              <thead style={{ borderTop: "1px solid rgba(226, 232, 240, 0.8)", borderBottom: "1px solid rgba(226, 232, 240, 0.8)" }}>
                <tr style={{ background: "#F1F5F9" }}>
                  <th style={{ padding: "0.65rem 1rem", fontWeight: 700, fontSize: "0.78rem", color: "#334155", textAlign: "left", whiteSpace: "nowrap" }}>Run ID</th>
                  <th style={{ padding: "0.65rem 1rem", fontWeight: 700, fontSize: "0.78rem", color: "#334155", textAlign: "left" }}>Nama Run</th>
                  <th style={{ padding: "0.65rem 0.5rem", fontWeight: 700, fontSize: "0.78rem", color: "#334155", textAlign: "left" }}>Projects Covered</th>
                  <th style={{ padding: "0.65rem 0.5rem", fontWeight: 700, fontSize: "0.78rem", color: "#334155", textAlign: "left" }}>Suites Included</th>
                  <th style={{ padding: "0.65rem 0.5rem", fontWeight: 700, fontSize: "0.78rem", color: "#334155", textAlign: "left" }}>Sprint</th>
                  <th style={{ padding: "0.65rem 0.5rem", fontWeight: 700, fontSize: "0.78rem", color: "#334155", textAlign: "left" }}>Status</th>
                  <th style={{ padding: "0.65rem 0.5rem", fontWeight: 700, fontSize: "0.78rem", color: "#334155", textAlign: "left" }}>Pass Rate</th>
                  <th style={{ padding: "0.65rem 0.5rem", fontWeight: 700, fontSize: "0.78rem", color: "#334155", textAlign: "left" }}>Dibuat Oleh</th>
                  <th style={{ padding: "0.65rem 1rem", fontWeight: 700, fontSize: "0.78rem", color: "#334155", textAlign: "left" }}>Tanggal</th>
                  {data.canEdit && (
                    <th style={{ padding: "0.65rem 1rem", fontWeight: 700, fontSize: "0.78rem", color: "#334155", textAlign: "right" }}>Aksi</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <TestRunRow
                    key={run.id}
                    {...run}
                    extraAction={
                      data.canEdit ? (
                        <DeleteRunButton runId={run.id} runName={run.name} onDeleted={reload} />
                      ) : undefined
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer pagination di dalam card yang sama */}
        <HistoryPagination total={total} page={page} perPage={perPage} baseUrl="/test-runs" />
      </div>
    </main>
  );
}
