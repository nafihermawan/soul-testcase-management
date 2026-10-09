"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Download, FileSpreadsheet, FileText, Info, SlidersHorizontal } from "lucide-react";
import { Card } from "@/components/ui";
import { KpiCard } from "@/components/ui/kpi-card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Select } from "@/components/ui/select";
import { InitialsAvatar } from "@/components/ui/avatar";
import { ErrorBlock, TableCardSkeleton } from "@/components/ui/data-states";
import { useApi } from "@/lib/client/use-api";
import { BADGE_LABEL, MONTH_NAMES, type PeriodMode, type PerformanceBadge } from "@/lib/qa-performance";
import {
  exportQaPerformanceCsv,
  exportQaPerformanceXlsx,
} from "@/components/analytics/qa-performance-export";
import type { QaPerformanceMember, QaPerformancePayload } from "@/types/api";

const MONTHS_PER_QUARTER = 3;

/** Warna teks status performa — minimalis (tanpa pill/latar). */
const BADGE_COLOR: Record<PerformanceBadge, string> = {
  TOP_PERFORMER: "#047857",
  ON_TRACK: "#2563EB",
  NEEDS_ATTENTION: "#BE123C",
};

/** Warna bar pass rate: hijau ≥80, amber 50–79, rose <50, abu bila belum ada data. */
function passRateColor(value: number | null): string {
  if (value === null) return "#CBD5E1";
  if (value >= 80) return "#059669";
  if (value >= 50) return "#D97706";
  return "#E11D48";
}

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
  fontSize: 12,
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

/** Nilai filter periode QA Performance (mode + bulan/quarter + tahun). */
type QaPeriodSelection = {
  mode: PeriodMode;
  year: number;
  quarter: number;
  month: number;
};

const MODE_LABEL: Record<PeriodMode, string> = {
  month: "Per Bulan",
  quarter: "Per Quarter",
  year: "Per Tahun",
};

/** Label ringkas periode dari nilai yang berlaku (mis. "Q4 2026"). */
function periodLabelOf(p: QaPeriodSelection): string {
  if (p.mode === "month") return `${MONTH_NAMES[p.month - 1]} ${p.year}`;
  if (p.mode === "quarter") return `Q${p.quarter} ${p.year}`;
  return String(p.year);
}

/**
 * Satu tombol filter periode menggantikan 3 dropdown (mode/quarter/tahun):
 * trigger menampilkan label gabungan, popover berisi segment mode + selector
 * bulan/quarter + tahun. Nilai ditahan sebagai draft dan baru diterapkan saat
 * "Terapkan" diklik; popover di-portal agar tidak terpotong `overflow: hidden`
 * kartu toolbar.
 */
function PeriodFilterControl({
  value,
  availableYears,
  onApply,
}: {
  value: QaPeriodSelection;
  availableYears: number[];
  onApply: (next: QaPeriodSelection) => void;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<QaPeriodSelection>(value);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const openPopover = () => {
    const r = btnRef.current?.getBoundingClientRect();
    // Clamp ke kiri viewport supaya popover (lebar 288) tidak keluar layar.
    if (r) setPos({ top: r.bottom + 6, left: Math.max(12, Math.min(r.left, window.innerWidth - 288 - 12)) });
    setDraft(value);
    setOpen(true);
  };

  // Hanya Escape di sini. Klik "di luar" ditangani BACKDROP di dalam portal
  // (lihat bawah) — bukan listener `document`. Listener document tidak bisa
  // dipakai karena menu dropdown <Select> di-render lewat portal TERPISAH ke
  // body, sehingga klik pada opsinya terbaca sebagai "di luar" dan menutup
  // popover ini sebelum pilihan diterapkan.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const set = <K extends keyof QaPeriodSelection>(key: K, v: QaPeriodSelection[K]) =>
    setDraft((prev) => ({ ...prev, [key]: v }));

  // Reset draft ke default: quarter berjalan (bulan/tahun saat ini).
  const resetDraft = () =>
    setDraft({
      mode: "quarter",
      year: new Date().getUTCFullYear(),
      quarter: Math.floor(new Date().getUTCMonth() / MONTHS_PER_QUARTER) + 1,
      month: new Date().getUTCMonth() + 1,
    });

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openPopover())}
        aria-haspopup="dialog"
        aria-expanded={open}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.375rem",
          // Styling baku tombol Filter aplikasi (selaras Bugs Tracker / Run History):
          // border-amber-400 · text-amber-700 · bg-amber-50/50 · hover:bg-amber-100
          // font-semibold · text-xs · px-3 py-1.5 · rounded-lg
          fontSize: 12,
          fontWeight: 600,
          color: "#B45309",
          background: "rgba(255, 251, 235, 0.5)",
          border: "1px solid #FBBF24",
          borderRadius: 8,
          padding: "0.375rem 0.75rem",
          cursor: "pointer",
          transition: "background-color 0.15s ease",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "#FEF3C7")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255, 251, 235, 0.5)")}
      >
        <SlidersHorizontal size={13} />
        Filter
      </button>

      {open &&
        pos &&
        createPortal(
          <>
            {/* Backdrop transparan (z di bawah popover): klik di luar menutup.
                Berada di portal yang SAMA dengan popover sehingga klik pada menu
                Select (portal terpisah) tetap dianggap "di dalam" — double-click
                tidak menutup. */}
            <div
              aria-hidden="true"
              onMouseDown={() => setOpen(false)}
              style={{ position: "fixed", inset: 0, zIndex: 399 }}
            />
            <div
              role="dialog"
              aria-label="Filter periode"
              // Cegah klik/gulir dari dalam popover merambat ke luar.
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              style={{
                position: "fixed",
                top: pos.top,
                left: pos.left,
                zIndex: 400,
                width: 288,
                background: "#fff",
                border: "1px solid #E2E8F0",
                borderRadius: 12,
                boxShadow: "0 12px 32px rgba(15, 23, 42, 0.16)",
                padding: 12,
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              {/* Segment mode periode */}
              <div
                style={{
                  display: "flex",
                  gap: 4,
                  background: "#F1F5F9",
                  padding: 3,
                  borderRadius: 8,
                }}
              >
                {(["month", "quarter", "year"] as const).map((m) => {
                  const active = draft.mode === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => set("mode", m)}
                      style={{
                        flex: 1,
                        padding: "0.3rem 0.4rem",
                        border: "none",
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                        background: active ? "#fff" : "transparent",
                        color: active ? "#0F172A" : "#64748B",
                        boxShadow: active ? "0 1px 2px rgba(15, 23, 42, 0.08)" : "none",
                        transition: "background-color 0.15s ease, color 0.15s ease",
                      }}
                    >
                      {MODE_LABEL[m]}
                    </button>
                  );
                })}
              </div>

              {/* Selector kontekstual — Bulan / Quarter (mode tahun tak perlu). */}
              {draft.mode !== "year" && (
                <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#64748B" }}>
                    {draft.mode === "month" ? "Bulan" : "Quarter"}
                  </span>
                  {draft.mode === "month" ? (
                    <Select
                      value={String(draft.month)}
                      size="sm"
                      ariaLabel="Bulan"
                      onChange={(e) => set("month", Number(e.target.value))}
                    >
                      {MONTH_NAMES.map((name, i) => (
                        <option key={name} value={i + 1}>
                          {name}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Select
                      value={String(draft.quarter)}
                      size="sm"
                      ariaLabel="Quarter"
                      onChange={(e) => set("quarter", Number(e.target.value))}
                    >
                      {[1, 2, 3, 4].map((q) => (
                        <option key={q} value={q}>
                          Q{q}
                        </option>
                      ))}
                    </Select>
                  )}
                </label>
              )}

              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#64748B" }}>Tahun</span>
                <Select
                  value={String(draft.year)}
                  size="sm"
                  ariaLabel="Tahun"
                  onChange={(e) => set("year", Number(e.target.value))}
                >
                  {availableYears.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </Select>
              </label>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  gap: 8,
                  paddingTop: 10,
                  borderTop: "1px solid #F1F5F9",
                }}
              >
                <button
                  type="button"
                  onClick={resetDraft}
                  style={{
                    padding: "0.4rem 0.9rem",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#475569",
                    background: "#fff",
                    border: "1px solid #E2E8F0",
                    borderRadius: 6,
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#F8FAFC")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
                >
                  Reset
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onApply(draft);
                    setOpen(false);
                  }}
                  style={{
                    padding: "0.4rem 0.9rem",
                    fontSize: 12,
                    fontWeight: 700,
                    color: "#0F172A",
                    background: "#FFC348",
                    border: "none",
                    borderRadius: 6,
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#F0B53D")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "#FFC348")}
                >
                  Terapkan
                </button>
              </div>
            </div>
          </>,
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
  const [period, setPeriod] = useState<QaPeriodSelection>({
    mode: "quarter",
    year: now.getUTCFullYear(),
    quarter: Math.floor(now.getUTCMonth() / MONTHS_PER_QUARTER) + 1,
    month: now.getUTCMonth() + 1,
  });

  const { data, error, loading, reload } = useApi<QaPerformancePayload>(
    `/api/qa-performance?mode=${period.mode}&year=${period.year}&quarter=${period.quarter}&month=${period.month}`
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
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {/* Satu tombol Filter standar; label periode aktif tetap ditampilkan. */}
            <PeriodFilterControl
              value={period}
              availableYears={data.availableYears}
              onApply={setPeriod}
            />
            <span style={{ fontSize: 12, color: "#64748B" }}>
              Periode{" "}
              <strong style={{ color: "#334155", fontWeight: 600 }}>{periodLabelOf(period)}</strong>
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <ExportMenu
              disabled={data.members.length === 0}
              onExcel={() => void exportQaPerformanceXlsx(data)}
              onCsv={() => void exportQaPerformanceCsv(data)}
            />
          </div>
        </div>
      </Card>

      {/* Kartu ringkasan tim — padding rapat, tanpa dot dekoratif (netral & seragam). */}
      <div className="metric-grid" style={{ marginBottom: 12 }}>
        <KpiCard
          compact
          label="Total Executed Test Cases"
          value={String(totals.executedCases)}
          sub="Eksekusi (status ≠ Not run) pada periode ini"
        />
        <KpiCard
          compact
          label="Average Pass Rate"
          value={totals.passRate === null ? "—" : `${totals.passRate}%`}
          sub={
            totals.passRate === null
              ? "Belum ada hasil Pass/Fail di periode ini"
              : "Pass ÷ (Pass + Fail), agregat tim"
          }
        />
        <KpiCard
          compact
          label="Total Bugs Reported"
          value={String(totals.bugsReported)}
          sub="Bug yang dilaporkan pada periode ini"
        />
        <KpiCard
          compact
          label="Resolved / Re-opened Runs"
          value={`${totals.completedRuns} / ${totals.reopenedRuns}`}
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
              title="Total test case di sistem (seluruh waktu) — tidak mengikuti filter periode"
              style={{ fontSize: 12, fontWeight: 500, color: "#64748B" }}
            >
              Total TC: {totals.allTimeCreatedCases.toLocaleString("id-ID")}
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
  const tone = BADGE_COLOR[member.badge];
  return (
    <tr style={rowDivider}>
      {/* QA member: avatar inisial + nama + role */}
      <td style={td}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <InitialsAvatar name={member.name ?? "(tanpa nama)"} size={24} />
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 12,
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
        {/* Status minimalis: dot warna + teks, tanpa pill/latar. */}
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            color: tone,
            fontSize: 12,
            fontWeight: 600,
            whiteSpace: "nowrap",
          }}
        >
          <span
            style={{ width: 6, height: 6, borderRadius: 999, background: tone, flexShrink: 0 }}
          />
          {BADGE_LABEL[member.badge]}
        </span>
      </td>
    </tr>
  );
}
