"use client";

import { useEffect, useMemo, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { Card } from "@/components/ui";
import { FilterModal } from "@/components/ui/filter-modal";
import { CustomSelect, filterLabelStyle } from "@/components/ui/custom-select";
import { ErrorBlock, StatsCardsSkeleton, TableCardSkeleton } from "@/components/ui/data-states";
import { ReportsView } from "@/components/reports/reports-view";
import {
  QaPerformanceView,
  PeriodFilterControl,
  ExportMenu,
  defaultQaPeriod,
  type QaPeriodSelection,
} from "@/components/analytics/qa-performance-view";
import {
  exportQaPerformanceCsv,
  exportQaPerformanceXlsx,
} from "@/components/analytics/qa-performance-export";
import { useApi } from "@/lib/client/use-api";
import { useMe } from "@/lib/client/me-context";
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
 * Akses: HANYA Lead QA (role QA + flag isQaLead). Non-lead langsung dikunci
 * dengan guard screen; API performa juga menolak 403 di sisi server.
 *
 * Tab navigation duduk di luar card konten (persis di bawah header), dan
 * toolbar tiap tab (Filter / Export Report) ada di header kanan atas.
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

  // --- Tab QA Performance: periode + data di-fetch di sini (bukan di dalam
  // QaPerformanceView) supaya tombol Filter & Export bisa duduk di header
  // halaman, sejajar dengan tombol Filter tab Coverage & Repository.
  const [period, setPeriod] = useState<QaPeriodSelection>(defaultQaPeriod);
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
                triggerClassName="btn-radius-10"
                iconSize={16}
                triggerStyle={{
                  height: 40,
                  padding: "0 14px",
                  border: "1px solid #FFC348",
                  background: "#FFF8E8",
                  color: "#0F172A",
                  fontSize: 14,
                  fontWeight: 600,
                  gap: 8,
                }}
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
            {tab === "performance" && (
              <>
                <PeriodFilterControl
                  value={period}
                  availableYears={qaData?.availableYears ?? [new Date().getUTCFullYear()]}
                  onApply={setPeriod}
                />
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
