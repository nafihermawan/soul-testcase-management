"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Download, FileSpreadsheet, FileText, Info } from "lucide-react";
import { Card } from "@/components/ui";
import { KpiCard } from "@/components/ui/kpi-card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Select } from "@/components/ui/select";
import { InitialsAvatar } from "@/components/ui/avatar";
import { ErrorBlock, TableCardSkeleton } from "@/components/ui/data-states";
import { useApi } from "@/lib/client/use-api";
import { BADGE_LABEL, type PeriodMode, type PerformanceBadge } from "@/lib/qa-performance";
import {
  exportQaPerformanceCsv,
  exportQaPerformanceXlsx,
} from "@/components/analytics/qa-performance-export";
import type { QaPerformanceMember, QaPerformancePayload } from "@/types/api";

const MONTHS_PER_QUARTER = 3;

/** Warna badge status performa (halus: latar -50, teks -700). */
const BADGE_TONE: Record<PerformanceBadge, { bg: string; color: string }> = {
  TOP_PERFORMER: { bg: "#ECFDF5", color: "#047857" },
  ON_TRACK: { bg: "#EFF6FF", color: "#2563EB" },
  NEEDS_ATTENTION: { bg: "#FFF1F2", color: "#BE123C" },
};

/** Warna bar pass rate: hijau ≥80, amber 50–79, rose <50, abu bila belum ada data. */
function passRateColor(value: number | null): string {
  if (value === null) return "#CBD5E1";
  if (value >= 80) return "#059669";
  if (value >= 50) return "#D97706";
  return "#E11D48";
}

/** Badge netral untuk angka konteks di header tabel. */
const neutralBadge: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "2px 10px",
  borderRadius: 999,
  background: "#F1F5F9",
  color: "#475569",
  fontSize: 11,
  fontWeight: 600,
  whiteSpace: "nowrap",
};

/** Penjelasan perhitungan tiap metrik — dipindah ke tooltip (i) header tabel. */
const METRIC_HELP = [
  "TCs created — pembuat awal test case (TestCase.createdById) pada periode ini.",
  "Executed cases & Pass rate — hasil eksekusi yang terakhir diubah pada periode ini (TestRunResult.updatedById, status ≠ NOT_RUN); Pass rate = PASS ÷ (PASS + FAIL).",
  "Bugs found — bug yang dilaporkan (Bug.createdById) pada periode ini.",
  "Assigned runs — penugasan multi-assignee (TestRunAssignee) pada run yang dibuat di periode ini.",
  "Score — 0,6×pass rate + 0,25×volume eksekusi (relatif ke tertinggi) + 0,15×bug (relatif ke tertinggi); badge ≥85 Top Performer, ≥70 On Track, sisanya Needs Attention.",
  "Avg. execution time belum tersedia — sistem tidak mencatat durasi eksekusi.",
].join("\n");

/** Divider inset (tidak mentok tepi kartu) — pola yang dipakai tabel lain. */
const rowDivider: CSSProperties = {
  backgroundImage:
    "linear-gradient(to right, transparent 0, transparent 16px, #F1F5F9 16px, #F1F5F9 calc(100% - 16px), transparent calc(100% - 16px))",
  backgroundSize: "100% 1px",
  backgroundPosition: "top left",
  backgroundRepeat: "no-repeat",
};

const th: CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 10,
  background: "#F8FAFC",
  padding: "9px 12px",
  fontSize: 13,
  fontWeight: 600,
  color: "#64748B",
  whiteSpace: "nowrap",
  textAlign: "left",
  borderBottom: "1px solid #E2E8F0",
};

const td: CSSProperties = {
  padding: "10px 12px",
  fontSize: 12,
  fontWeight: 400,
  color: "#475569",
  whiteSpace: "nowrap",
  verticalAlign: "middle",
};

/** Menu kecil Export Report (portal supaya tidak terpotong overflow card). */
function ExportMenu({
  disabled,
  onExcel,
  onCsv,
}: {
  disabled: boolean;
  onExcel: () => void;
  onCsv: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const el = btnRef.current;
    if (el) {
      const r = el.getBoundingClientRect();
      setPos({ top: r.bottom + 6, right: window.innerWidth - r.right });
    }
    const close = (e: MouseEvent) => {
      if (!btnRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item: CSSProperties = {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 10px",
    border: "none",
    borderRadius: 6,
    background: "transparent",
    color: "#334155",
    fontSize: 12,
    fontWeight: 500,
    textAlign: "left",
    cursor: "pointer",
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          height: 32,
          padding: "0 12px",
          borderRadius: 8,
          border: "1px solid #E2E8F0",
          background: "#fff",
          color: "#334155",
          fontSize: 12,
          fontWeight: 600,
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.55 : 1,
          whiteSpace: "nowrap",
        }}
      >
        <Download size={14} />
        Export Report
        <ChevronDown size={13} style={{ color: "#94A3B8" }} />
      </button>

      {open &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            role="menu"
            style={{
              position: "fixed",
              top: pos.top,
              right: pos.right,
              width: 190,
              zIndex: 400,
              background: "#fff",
              border: "1px solid #E2E8F0",
              borderRadius: 10,
              boxShadow: "0 12px 24px -6px rgba(15, 23, 42, 0.18)",
              padding: 4,
              animation: "dropdownIn 0.12s ease-out",
            }}
          >
            <button
              type="button"
              role="menuitem"
              style={item}
              onClick={() => {
                setOpen(false);
                onExcel();
              }}
            >
              <FileSpreadsheet size={14} style={{ color: "#059669" }} /> Excel (.xlsx)
            </button>
            <button
              type="button"
              role="menuitem"
              style={item}
              onClick={() => {
                setOpen(false);
                onCsv();
              }}
            >
              <FileText size={14} style={{ color: "#2563EB" }} /> CSV (.csv)
            </button>
          </div>,
          document.body
        )}
    </>
  );
}

/**
 * QA Performance Analytics — hanya dirender untuk Lead QA (gerbang di page).
 *
 * Catatan metrik: "Avg. Execution Time" sengaja tidak ditampilkan karena sistem
 * belum menyimpan durasi eksekusi (tidak ada kolom startedAt/finishedAt), dan
 * atribusi eksekusi memakai `TestRunResult.updatedById` = pengubah terakhir.
 */
export function QaPerformanceView() {
  const now = new Date();
  const [mode, setMode] = useState<PeriodMode>("quarter");
  const [year, setYear] = useState(now.getUTCFullYear());
  const [quarter, setQuarter] = useState(
    Math.floor(now.getUTCMonth() / MONTHS_PER_QUARTER) + 1
  );

  const { data, error, loading, reload } = useApi<QaPerformancePayload>(
    `/api/qa-performance?mode=${mode}&year=${year}&quarter=${quarter}`
  );

  if (error) return <ErrorBlock message={error.message} onRetry={reload} />;
  if (loading || !data) {
    return (
      <div style={{ width: "100%" }}>
        <TableCardSkeleton />
      </div>
    );
  }

  const totals = data.totals;

  return (
    <div style={{ fontFamily: "var(--font-sans)", width: "100%" }}>
      {/* Toolbar tab: periode + export (judul halaman ada di header induk) */}
      <Card style={{ padding: "0.875rem", marginBottom: 12 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: 12, color: "#64748B" }}>
            Periode{" "}
            <strong style={{ color: "#334155", fontWeight: 600 }}>{data.period.label}</strong>
          </span>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Select
              value={mode}
              size="sm"
              ariaLabel="Mode periode"
              style={{ width: 132 }}
              onChange={(e) => setMode(e.target.value as PeriodMode)}
            >
              <option value="quarter">Per Quarter</option>
              <option value="year">Per Year</option>
            </Select>

            {mode === "quarter" && (
              <Select
                value={String(quarter)}
                size="sm"
                ariaLabel="Quarter"
                style={{ width: 84 }}
                onChange={(e) => setQuarter(Number(e.target.value))}
              >
                {[1, 2, 3, 4].map((q) => (
                  <option key={q} value={q}>
                    Q{q}
                  </option>
                ))}
              </Select>
            )}

            <Select
              value={String(year)}
              size="sm"
              ariaLabel="Tahun"
              style={{ width: 96 }}
              onChange={(e) => setYear(Number(e.target.value))}
            >
              {data.availableYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>

            <ExportMenu
              disabled={data.members.length === 0}
              onExcel={() => void exportQaPerformanceXlsx(data)}
              onCsv={() => void exportQaPerformanceCsv(data)}
            />
          </div>
        </div>
      </Card>

      {/* Kartu ringkasan tim — aksen berupa indicator dot, tanpa garis atas. */}
      <div className="metric-grid" style={{ marginBottom: 12 }}>
        <KpiCard
          label="Total Executed Test Cases"
          value={String(totals.executedCases)}
          dot="#0EA5E9"
          sub="Eksekusi (status ≠ Not run) pada periode ini"
        />
        <KpiCard
          label="Average Pass Rate"
          value={totals.passRate === null ? "—" : `${totals.passRate}%`}
          dot="#F59E0B"
          sub={
            totals.passRate === null
              ? "Belum ada hasil Pass/Fail di periode ini"
              : "Pass ÷ (Pass + Fail), agregat tim"
          }
        />
        <KpiCard
          label="Total Bugs Reported"
          value={String(totals.bugsReported)}
          dot="#F43F5E"
          sub="Bug yang dilaporkan pada periode ini"
        />
        <KpiCard
          label="Resolved / Re-opened Runs"
          value={`${totals.completedRuns} / ${totals.reopenedRuns}`}
          dot="#10B981"
          sub="Run COMPLETED / RE_OPEN"
        />
      </div>

      {/* Tabel performa member — full height seperti halaman Active Runs */}
      <Card
        style={{
          padding: 0,
          minHeight: "calc(100vh - 280px)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ padding: "12px 16px 8px", flexShrink: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <h2 style={{ fontSize: 13, fontWeight: 600, color: "#475569", margin: 0 }}>
                Performa member QA
              </h2>
              {/* Detail perhitungan disembunyikan di tooltip supaya header rapi. */}
              <span
                role="img"
                aria-label="Penjelasan perhitungan metrik"
                title={METRIC_HELP}
                style={{ display: "inline-flex", color: "#94A3B8", cursor: "help" }}
              >
                <Info size={14} />
              </span>
            </span>
            <span
              style={neutralBadge}
              title="Total test case di sistem (seluruh waktu) — tidak mengikuti filter periode"
            >
              Total Test Case Dibuat: {totals.allTimeCreatedCases.toLocaleString("id-ID")}
            </span>
          </div>
        </div>

        {data.members.length === 0 ? (
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "2.5rem 1.5rem",
              textAlign: "center",
              fontSize: 12,
              color: "#94A3B8",
            }}
          >
            Belum ada aktivitas QA pada periode ini. Coba pilih periode lain.
          </div>
        ) : (
          <div style={{ flex: 1, minHeight: 0, overflowX: "auto", overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "auto" }}>
              <colgroup>
                <col style={{ minWidth: 230 }} />
                <col style={{ width: 130 }} />
                <col style={{ width: 130 }} />
                <col style={{ width: 130 }} />
                <col style={{ width: 210 }} />
                <col style={{ width: 120 }} />
                <col style={{ width: 90 }} />
                <col style={{ width: 140 }} />
              </colgroup>
              <thead>
                <tr>
                  <th style={th}>QA member</th>
                  <th style={{ ...th, textAlign: "center" }}>Assigned runs</th>
                  <th style={{ ...th, textAlign: "center" }}>Executed cases</th>
                  <th style={{ ...th, textAlign: "center" }}>TCs created</th>
                  <th style={th}>Pass rate</th>
                  <th style={{ ...th, textAlign: "center" }}>Bugs found</th>
                  <th style={{ ...th, textAlign: "center" }}>Score</th>
                  <th style={th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.members.map((m) => (
                  <MemberRow key={m.id} member={m} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function MemberRow({ member }: { member: QaPerformanceMember }) {
  const tone = BADGE_TONE[member.badge];
  return (
    <tr style={rowDivider}>
      {/* QA member: avatar inisial + nama + role */}
      <td style={td}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <InitialsAvatar name={member.name ?? "(tanpa nama)"} size={30} />
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: "#1E293B",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={member.name ?? "(tanpa nama)"}
            >
              {member.name ?? "(tanpa nama)"}
            </div>
            <div style={{ fontSize: 11, color: "#94A3B8" }}>{member.roleLabel}</div>
          </div>
        </div>
      </td>

      <td style={{ ...td, textAlign: "center", fontWeight: 600, color: "#334155" }}>
        {member.assignedRuns}
      </td>
      <td style={{ ...td, textAlign: "center", fontWeight: 600, color: "#334155" }}>
        {member.executedCases}
      </td>
      <td style={{ ...td, textAlign: "center", fontWeight: 600, color: "#334155" }}>
        {member.createdCases}
      </td>

      {/* Pass rate: bar + angka */}
      <td style={td}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ flex: 1, minWidth: 90 }}>
            {/* Bar selalu emerald (sinyal sukses); angka tetap berwarna sesuai ambang. */}
            <ProgressBar value={member.passRate ?? 0} color="#10B981" height={6} />
          </span>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: passRateColor(member.passRate),
              minWidth: 42,
              textAlign: "right",
            }}
            title={`${member.passed} pass · ${member.failed} fail`}
          >
            {member.passRate === null ? "—" : `${member.passRate}%`}
          </span>
        </div>
      </td>

      <td style={{ ...td, textAlign: "center", fontWeight: 600, color: "#334155" }}>
        {member.bugsFound}
      </td>
      <td style={{ ...td, textAlign: "center", fontWeight: 700, color: "#1E293B" }}>
        {member.score}
      </td>

      <td style={td}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "2px 10px",
            borderRadius: 999,
            background: tone.bg,
            color: tone.color,
            fontSize: 11,
            fontWeight: 600,
            whiteSpace: "nowrap",
          }}
        >
          {BADGE_LABEL[member.badge]}
        </span>
      </td>
    </tr>
  );
}
