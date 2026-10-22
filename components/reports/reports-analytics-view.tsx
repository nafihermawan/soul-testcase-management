"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui";
import { FilterModal } from "@/components/ui/filter-modal";
import { FilterField, FilterPeriod, FilterSelect } from "@/components/ui/filter-fields";
import { ErrorBlock, StatsCardsSkeleton, TableCardSkeleton } from "@/components/ui/data-states";
import { ReportsView } from "@/components/reports/reports-view";
import {
  QaPerformanceView,
  ExportMenu,
  defaultQaPeriod,
  periodLabelOf,
  type QaPeriodSelection,
} from "@/components/analytics/qa-performance-view";
import {
  exportQaPerformanceCsv,
  exportQaPerformanceXlsx,
} from "@/components/analytics/qa-performance-export";
import { useApi } from "@/lib/client/use-api";
import { pct } from "@/lib/qa-metrics";
import type { QaPerformancePayload, ReportsPayload } from "@/types/api";

const ALL = "ALL";

type ReportsTabKey = "coverage" | "performance";

const REPORTS_TABS: { key: ReportsTabKey; label: string }[] = [
  { key: "coverage", label: "Coverage & Repository" },
  { key: "performance", label: "QA Performance" },
];

/**
 * Halaman terpadu "Reports & Analytics" — gabungan Reports (coverage &
 * repository) dan QA Performance Analytics.
 *
 * Akses: HANYA Lead QA (role QA + flag isQaLead) — ditegakkan oleh guard di
 * `app/(app)/reports/page.tsx` (redirect ke dashboard) dan oleh 403 di
 * /api/reports. Komponen ini sendiri tidak lagi mengurus RBAC.
 *
 * Tab navigation duduk di luar card konten (persis di bawah header), dan
 * toolbar tiap tab (Filter / Export Report) ada di header kanan atas.
 */
export function ReportsAnalyticsView() {
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

  // --- Tab QA Performance: periode + data di-fetch di sini (bukan di dalam
  // QaPerformanceView) supaya tombol Filter & Export bisa duduk di header
  // halaman, sejajar dengan tombol Filter tab Coverage & Repository.
  const [period, setPeriod] = useState<QaPeriodSelection>(defaultQaPeriod);
  // Draft periode untuk modal Filter tab QA Performance (diterapkan saat
  // "Terapkan Filter" diklik, sama seperti field filter lain).
  const [draftPeriod, setDraftPeriod] = useState<QaPeriodSelection>(period);
  useEffect(() => {
    setDraftPeriod(period);
  }, [period]);

  /** true bila periode MASIH default (quarter berjalan) → badge filter 0. */
  const isDefaultPeriod = (p: QaPeriodSelection) => {
    const d = defaultQaPeriod();
    return p.mode === d.mode && p.year === d.year && p.quarter === d.quarter && p.month === d.month;
  };

  const {
    data: qaData,
    error: qaError,
    loading: qaLoading,
    reload: qaReload,
  } = useApi<QaPerformancePayload>(
    `/api/qa-performance?mode=${period.mode}&year=${period.year}&quarter=${period.quarter}&month=${period.month}`,
    { enabled: tab === "performance" }
  );

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

  return (
    <main
      style={{
        fontFamily: "var(--font-sans, system-ui, sans-serif)",
        // Full-bleed ke area konten AppShell (batalkan padding 1rem), padding 24px
        // di semua sisi; lebar sengaja `auto` supaya gap kiri/kanan sama.
        margin: "-1rem",
        padding: 24,
        minHeight: "calc(100% + 2rem)",
        display: "flex",
        flexDirection: "column",
        gap: 18,
        background: "#F1F3F6",
      }}
    >
      {/* Header card: judul + deskripsi (kiri), aksi Filter/Export (kanan).
          Card ini TIDAK memuat divider atau tab. */}
      <Card style={{ border: "1px solid #E3E7EE", borderRadius: 18, padding: "24px 22px 22px 22px" }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 16,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <h1
              style={{
                fontSize: 24,
                fontWeight: 600,
                color: "#0F172A",
                letterSpacing: "-0.02em",
                margin: 0,
                lineHeight: 1.2,
              }}
            >
              Reports &amp; Analytics
            </h1>
            <p style={{ fontSize: 14, lineHeight: 1.5, color: "#475569", margin: 0 }}>
              Coverage &amp; kesehatan repository plus performa tim QA.
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
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
                <FilterField label="Platform" htmlFor="filter-reports-platform">
                  <FilterSelect
                    id="filter-reports-platform"
                    icon="platform"
                    ariaLabel="Filter platform"
                    allValue={ALL}
                    placeholder="Semua Platform"
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
                </FilterField>
                <FilterField label="Project" htmlFor="filter-reports-project">
                  <FilterSelect
                    id="filter-reports-project"
                    icon="project"
                    ariaLabel="Filter project"
                    allValue={ALL}
                    placeholder="Semua Project"
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
                </FilterField>
                <FilterField label="Status" htmlFor="filter-reports-status">
                  <FilterSelect
                    id="filter-reports-status"
                    icon="status"
                    ariaLabel="Filter status test case"
                    allValue={ALL}
                    placeholder="Semua Status"
                    value={draftStatus}
                    onChange={setDraftStatus}
                    options={[
                      { value: ALL, label: "Semua Status" },
                      { value: "ACTIVE", label: "Active" },
                      { value: "DRAFT", label: "Draft" },
                      { value: "DEPRECATED", label: "Deprecated" },
                    ]}
                  />
                </FilterField>
              </FilterModal>
            )}
            {tab === "performance" && (
              <>
                <FilterModal
                  title="Filter QA Performance"
                  activeCount={isDefaultPeriod(period) ? 0 : 1}
                  onReset={() => setDraftPeriod(defaultQaPeriod())}
                  onApply={() => setPeriod(draftPeriod)}
                >
                  <FilterField label="Period" htmlFor="filter-reports-period">
                    <FilterPeriod
                      id="filter-reports-period"
                      ariaLabel="Filter periode"
                      value={draftPeriod}
                      label={periodLabelOf(draftPeriod)}
                      availableYears={qaData?.availableYears ?? [new Date().getUTCFullYear()]}
                      onChange={setDraftPeriod}
                    />
                  </FilterField>
                </FilterModal>
                <ExportMenu
                  disabled={!qaData || qaData.members.length === 0}
                  onExcel={() => qaData && void exportQaPerformanceXlsx(qaData)}
                  onCsv={() => qaData && void exportQaPerformanceCsv(qaData)}
                />
              </>
            )}
          </div>
        </div>
      </Card>

      {/* Page tabs — di luar card konten, di bawah header card; garis dasar
          full width dan underline kuning duduk tepat di atas garis itu. */}
      <div
        role="tablist"
        aria-label="Reports & Analytics"
        style={{
          display: "flex",
          gap: 28,
          padding: "0 23px",
          marginTop: -4,
          borderBottom: "1px solid #DDE2E9",
        }}
      >
        {REPORTS_TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.key)}
              style={{
                height: 44,
                marginBottom: -1,
                padding: 0,
                border: "none",
                background: "transparent",
                fontSize: 14,
                fontWeight: active ? 600 : 500,
                color: active ? "#0F172A" : "#64748B",
                borderBottom: active ? "2px solid #FFC348" : "2px solid transparent",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

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
          />
        )
      ) : qaError ? (
        <ErrorBlock message={qaError.message} onRetry={qaReload} />
      ) : qaLoading || !qaData ? (
        <TableCardSkeleton />
      ) : (
        <QaPerformanceView data={qaData} />
      )}
    </main>
  );
}
