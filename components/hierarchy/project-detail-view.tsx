"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { SuiteTree } from "@/components/hierarchy/suite-tree";
import { ErrorBlock, LoadingBlock, NotFoundBlock } from "@/components/ui/data-states";
import { RefreshContext } from "@/lib/client/refresh-context";
import { useApi } from "@/lib/client/use-api";
import type { ProjectTreePayload } from "@/types/api";

export function ProjectDetailView({ projectId }: { projectId: string }) {
  const { data, error, loading, reload } = useApi<ProjectTreePayload>(
    `/api/projects/${projectId}`
  );

  if (error?.status === 404) {
    return (
      <main style={{ fontFamily: "var(--font-sans, system-ui, sans-serif)", width: "100%" }}>
        <NotFoundBlock title="Project tidak ditemukan" />
      </main>
    );
  }

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
        <LoadingBlock label="Memuat project…" />
      </main>
    );
  }

  return (
    <main style={{ fontFamily: "var(--font-sans, system-ui, sans-serif)", width: "100%" }}>
      {/* Header block */}
      <div
        style={{
          background: "#fff",
          border: "1px solid #E5E7EB",
          borderRadius: 12,
          boxShadow: "0px 1px 2px rgba(16, 24, 40, 0.04), 0px 4px 12px rgba(16, 24, 40, 0.06)",
          padding: 24,
          marginBottom: "1.5rem",
        }}
      >
        {/* Breadcrumb */}
        <nav
          aria-label="Breadcrumb"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.35rem",
            fontSize: 14,
            fontWeight: 400,
            color: "#6B7280",
            marginBottom: 16,
            flexWrap: "wrap",
          }}
        >
          <Link href="/" style={{ color: "#6B7280" }}>
            Projects
          </Link>
          <ChevronRight size={13} style={{ color: "#6B7280", opacity: 0.6 }} />
          <span style={{ color: "#111827", fontWeight: 600 }}>{data.project.name}</span>
        </nav>

        {/* Title & metadata + toolbar kanan */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <h1
              style={{
                fontSize: 24,
                fontWeight: 600,
                margin: 0,
                color: "#111827",
                letterSpacing: "-0.01em",
              }}
            >
              {data.project.name}
            </h1>
            <span
              style={{
                background: "#E5E7EB",
                color: "#1F2937",
                fontSize: "0.75rem",
                fontWeight: 600,
                padding: "0.15rem 0.5rem",
                borderRadius: 999,
              }}
            >
              {data.project.code}
            </span>
          </div>

          {/* Anchor untuk tombol "Tambah Suite" dari SuiteTree */}
          <div id="project-header-actions" />
        </div>
      </div>

      <RefreshContext.Provider value={reload}>
        <SuiteTree projectId={data.project.id} suites={data.suites} canEdit={data.canEdit} />
      </RefreshContext.Provider>
    </main>
  );
}
