"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { SuiteTree } from "@/components/hierarchy/suite-tree";
import { SANS } from "@/components/reports/report-tokens";
import { ErrorBlock, NotFoundBlock, SuiteSkeleton } from "@/components/ui/data-states";
import { RefreshContext } from "@/lib/client/refresh-context";
import { useApi } from "@/lib/client/use-api";
import type { ProjectTreePayload } from "@/types/api";

/** Divider inset di bawah header (token yang sama dengan halaman lain). */
const HEADER_DIVIDER = "#E8ECF1";

export function ProjectDetailView({ projectId }: { projectId: string }) {
  const { data, error, loading, reload } = useApi<ProjectTreePayload>(`/api/projects/${projectId}`);

  if (error?.status === 404) {
    return (
      <main style={{ fontFamily: SANS, width: "100%" }}>
        <NotFoundBlock title="Project tidak ditemukan" />
      </main>
    );
  }

  if (error) {
    return (
      <main style={{ fontFamily: SANS, width: "100%" }}>
        <ErrorBlock message={error.message} onRetry={reload} />
      </main>
    );
  }

  if (loading || !data) {
    return (
      <main style={{ fontFamily: SANS, width: "100%" }}>
        <SuiteSkeleton />
      </main>
    );
  }

  return (
    // Kolom flex setinggi area konten: `margin: -1rem` + `padding: 24` membatalkan
    // lalu mengembalikan inset AppShell supaya padding halaman jadi 24px.
    <main
      style={{
        fontFamily: SANS,
        margin: "-1rem",
        padding: 24,
        minHeight: "calc(100% + 2rem)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* SATU kartu gabungan: header → divider inset → daftar suite. */}
      <div
        style={{
          background: "#ffffff",
          border: "1px solid #E3E7EE",
          borderRadius: 18,
          overflow: "hidden",
          flex: 1,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 10 }}>
          <nav
            aria-label="Breadcrumb"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 13,
              flexWrap: "wrap",
            }}
          >
            <Link href="/" className="project-breadcrumb-link">
              Projects
            </Link>
            <ChevronRight size={12} style={{ color: "#CBD5E1" }} aria-hidden="true" />
            <span aria-current="page" style={{ fontWeight: 500, color: "#0F172A" }}>
              {data.project.name}
            </span>
          </nav>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <h1
              style={{
                fontSize: 24,
                fontWeight: 600,
                letterSpacing: "-0.02em",
                color: "#0F172A",
                margin: 0,
              }}
            >
              {data.project.name}
            </h1>

            {/* Anchor tombol "Tambah Suite" — dirender SuiteTree lewat portal. */}
            <div id="project-header-actions" style={{ display: "flex", alignItems: "center" }} />
          </div>
        </div>

        {/* Divider INSET: berhenti 22px dari tepi kiri/kanan. */}
        <div style={{ height: 1, margin: "0 22px", background: HEADER_DIVIDER, flexShrink: 0 }} />

        <RefreshContext.Provider value={reload}>
          <SuiteTree
            projectId={data.project.id}
            platform={data.project.platform}
            suites={data.suites}
            canEdit={data.canEdit}
          />
        </RefreshContext.Provider>
      </div>
    </main>
  );
}
