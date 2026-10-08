"use client";

import { useEffect, useMemo, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { Card } from "@/components/ui";
import { PageTabs } from "@/components/ui/page-tabs";
import { FilterModal } from "@/components/ui/filter-modal";
import { CustomSelect, filterLabelStyle } from "@/components/ui/custom-select";
import { ErrorBlock, StatsCardsSkeleton, TableCardSkeleton } from "@/components/ui/data-states";
import { ReportsView } from "@/components/reports/reports-view";
import { WeeklyReportButton } from "@/components/reports/weekly-report-button";
import { QaPerformanceView } from "@/components/analytics/qa-performance-view";
import { useApi } from "@/lib/client/use-api";
import { useMe } from "@/lib/client/me-context";
import { pct } from "@/lib/qa-metrics";
import type { ReportsPayload } from "@/types/api";

const ALL = "ALL";

type ReportsTabKey = "coverage" | "performance";

/**
 * Halaman terpadu "Reports & Analytics" — gabungan Reports (coverage &
 * repository) dan QA Performance Analytics.
 *
 * Akses: HANYA Lead QA (role QA + flag isQaLead). Non-lead langsung dikunci
 * dengan guard screen; API performa juga menolak 403 di sisi server.
 *
 * Tab navigation duduk di luar card konten (persis di bawah header), dan
 * toolbar tiap tab (Filter / Buat Laporan) ada di header kanan atas.
 */
export function ReportsAnalyticsView() {
  const { me, loading: meLoading } = useMe();
  const [tab, setTab] = useState<ReportsTabKey>("coverage");

  // Data + filter tab Coverage (tombol Filter-nya hidup di header halaman).
  const { data, error, loading, reload } = useApi<ReportsPayload>("/api/reports");
  const [platform, setPlatform] = useState<string>(ALL);
  const [project, setProject] = useState<string>(ALL);
  // Field ke-3 (Status): sengaja TAMPIL DULU — belum memfilter data apa pun
  // (placeholder untuk di-wire menyusul); karena itu tidak masuk activeCount.
  const [tcStatus, setTcStatus] = useState<string>(ALL);
  // Draft filter untuk popover: baru diterapkan saat tombol Terapkan diklik.
  const [draftPlatform, setDraftPlatform] = useState<string>(ALL);
  const [draftProject, setDraftProject] = useState<string>(ALL);
  const [draftStatus, setDraftStatus] = useState<string>(ALL);
  useEffect(() => {
    setDraftPlatform(platform);
    setDraftProject(project);
    setDraftStatus(tcStatus);
  }, [platform, project, tcStatus]);

  const isFiltered = platform !== ALL || project !== ALL;

  // Section yang punya keterkaitan project/suite dihitung ulang di client dari
  // daftar suite, supaya filter Platform/Project konsisten di seluruh tab.
  const view = useMemo(() => {
    if (!data) return null;
    const byPlatform = (p: string | null) =>
      platform === ALL || (p ?? "").toUpperCase() === platform;

    const suites = data.coverageGap.filter(
      (s) => byPlatform(s.platform) && (project === ALL || s.projectId === project)
    );
    const platformOfProject = (projectId: string) =>
      data.projects.find((p) => p.id === projectId)?.platform ?? null;
    const suitesWithoutTc = data.suitesWithoutTc.filter(
      (s) =>
        (project === ALL || s.projectId === project) && byPlatform(platformOfProject(s.projectId))
    );

    const inSuite = suites.reduce((sum, s) => sum + s.total, 0);
    const untested = suites.reduce((sum, s) => sum + s.untested, 0);
    // TC tanpa suite tidak melekat pada project mana pun -> hanya muncul saat
    // tidak ada filter aktif, agar angka tidak mengklaim milik satu project.
    const orphanCount = isFiltered ? 0 : data.orphanTc.length;
    const totalTC = inSuite + orphanCount;
    const projectIds = new Set(suites.map((s) => s.projectId));

    return {
      suites,
      suitesWithoutTc,
      inventory: {
        totalTC,
        inSuite,
        // Suite kosong tetap dihitung, kalau tidak jumlahnya menyesatkan
        // (16 vs 20 suite yang benar-benar ada).
        suites: suites.length + suitesWithoutTc.length,
        projects: isFiltered ? projectIds.size : data.inventory.projects,
        untested,
        untestedPct: pct(untested, inSuite),
      },
    };
  }, [data, platform, project, isFiltered]);

  // --- RBAC: khusus Lead QA -------------------------------------------------
  if (meLoading) return <TableCardSkeleton />;
  if (me && !me.isQaLead) {
    return (
      <main style={{ fontFamily: "var(--font-sans, system-ui, sans-serif)", width: "100%" }}>
        <Card style={{ padding: "2.5rem 1.5rem", textAlign: "center" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 52,
              height: 52,
              borderRadius: "50%",
              background: "#FFF1F2",
              color: "#E11D48",
              marginBottom: 12,
            }}
          >
            <ShieldAlert size={24} />
          </div>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: "#1E293B", margin: 0 }}>
            Access Denied
          </h1>
          <p
            style={{
              fontSize: 13,
              color: "#64748B",
              margin: "0.5rem auto 0",
              maxWidth: 430,
              lineHeight: 1.6,
            }}
          >
            Hanya QA Lead yang dapat mengakses halaman Laporan &amp; Performa QA ini.
          </p>
          <p style={{ fontSize: 11, color: "#94A3B8", marginTop: 10 }}>
            Role akunmu saat ini: {me.role}
            {me.role === "QA" ? " (belum ditandai Lead QA)" : ""} — minta Lead QA mengaktifkannya di
            Settings → User &amp; Roles.
          </p>
        </Card>
      </main>
    );
  }

  return (
    <main
      style={{
        fontFamily: "var(--font-sans, system-ui, sans-serif)",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        gap: "1rem",
      }}
    >
      {/* Header halaman + aksi (Filter & Buat Laporan) — responsif. */}
      <Card style={{ padding: "0.875rem" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: "#1E293B",
                letterSpacing: "-0.025em",
                margin: 0,
              }}
            >
              Reports &amp; Analytics
            </h1>
            <p style={{ fontSize: 12, color: "#64748B", margin: "0.25rem 0 0" }}>
              Coverage &amp; kesehatan repository plus performa tim QA.
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {tab === "coverage" && data && (
              <FilterModal
                title="Filter Reports"
                activeCount={(platform !== ALL ? 1 : 0) + (project !== ALL ? 1 : 0)}
                onReset={() => {
                  setDraftPlatform(ALL);
                  setDraftProject(ALL);
                  setDraftStatus(ALL);
                }}
                onApply={() => {
                  setPlatform(draftPlatform);
                  setProject(draftProject);
                  setTcStatus(draftStatus);
                }}
              >
                <div>
                  <span style={filterLabelStyle}>Platform</span>
                  <CustomSelect
                    ariaLabel="Filter platform"
                    value={draftPlatform}
                    onChange={(v) => {
                      setDraftPlatform(v);
                      // Cascading: project yang tidak cocok Platform baru dibuang.
                      const stillValid = data.projects.some(
                        (p) =>
                          p.id === draftProject &&
                          (v === ALL || (p.platform ?? "").toUpperCase() === v)
                      );
                      if (!stillValid) setDraftProject(ALL);
                    }}
                    options={[
                      { value: ALL, label: "Semua Platform" },
                      { value: "WEB", label: "Web" },
                      { value: "MOBILE", label: "Mobile" },
                      { value: "HARDWARE", label: "Hardware" },
                      { value: "API", label: "API" },
                    ]}
                  />
                </div>
                <div>
                  <span style={filterLabelStyle}>Project</span>
                  <CustomSelect
                    ariaLabel="Filter project"
                    value={draftProject}
                    onChange={setDraftProject}
                    options={[
                      { value: ALL, label: "Semua Project" },
                      ...data.projects
                        .filter(
                          (p) =>
                            draftPlatform === ALL ||
                            (p.platform ?? "").toUpperCase() === draftPlatform
                        )
                        .map((p) => ({ value: p.id, label: p.name })),
                    ]}
                  />
                </div>
                {/* Field ke-3 — styling identik dengan dua field di atasnya. */}
                <div>
                  <span style={filterLabelStyle}>Status</span>
                  <CustomSelect
                    ariaLabel="Filter status test case"
                    value={draftStatus}
                    onChange={setDraftStatus}
                    options={[
                      { value: ALL, label: "Semua Status" },
                      { value: "ACTIVE", label: "Active" },
                      { value: "DRAFT", label: "Draft" },
                      { value: "DEPRECATED", label: "Deprecated" },
                    ]}
                  />
                </div>
              </FilterModal>
            )}
            <WeeklyReportButton />
          </div>
        </div>
      </Card>

      {/* Tab navigation — di luar card konten. */}
      <PageTabs<ReportsTabKey>
        active={tab}
        onChange={setTab}
        tabs={[
          { key: "coverage", label: "Coverage & Repository" },
          { key: "performance", label: "QA Performance" },
        ]}
      />

      {tab === "coverage" ? (
        error ? (
          <ErrorBlock message={error.message} onRetry={reload} />
        ) : loading || !data || !view ? (
          <>
            <StatsCardsSkeleton count={3} />
            <div style={{ height: "1.25rem" }} />
            <TableCardSkeleton />
          </>
        ) : (
          <ReportsView
            data={data}
            suites={view.suites}
            suitesWithoutTc={view.suitesWithoutTc}
            inventory={view.inventory}
            isFiltered={isFiltered}
          />
        )
      ) : (
        <QaPerformanceView />
      )}
    </main>
  );
}
