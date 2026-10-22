"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { initialsOf } from "@/components/ui/avatar";
import { BADGE_LABEL, MONTH_NAMES, type PeriodMode, type PerformanceBadge } from "@/lib/qa-performance";
import {
  SANS,
  MONO,
  cardStyle,
  LINE,
  HEAD_BG,
  ROW_DIVIDER,
  fmt,
} from "@/components/reports/report-tokens";
import type { QaPerformanceMember, QaPerformancePayload } from "@/types/api";

const MONTHS_PER_QUARTER = 3;

/* ------------------------------- Tokens ------------------------------- */

/** Warna teks status performa — dot & teks sama, tanpa pill. */
const BADGE_COLOR: Record<PerformanceBadge, string> = {
  TOP_PERFORMER: "#15803D",
  ON_TRACK: "#B45309",
  NEEDS_ATTENTION: "#B91C1C",
};

/** Warna teks pass rate per ambang; null (tanpa data) → muted. */
function passRateColor(value: number | null): string {
  if (value === null) return "#94A3B8";
  if (value >= 80) return "#15803D";
  if (value >= 50) return "#B45309";
  return "#B91C1C";
}

/** Tombol aksi di header card (Filter sekunder & Export Report primer). */
const HEADER_BTN: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  height: 40,
  borderRadius: 10,
  fontSize: 14,
  fontWeight: 600,
  border: "1px solid #FFC348",
  color: "#0F172A",
  cursor: "pointer",
  whiteSpace: "nowrap",
  transition: "background-color 0.15s ease, border-color 0.15s ease",
};

/* ---------------------------- KPI (3 baris) --------------------------- */

const KPI_CARD = {
  background: "#ffffff",
  border: "1px solid #E3E7EE",
  borderRadius: 16,
  padding: "18px 20px",
  display: "flex",
  flexDirection: "column",
  gap: 12,
} as const;

const KPI_ROW_LABEL = { height: 24, display: "flex", alignItems: "center" } as const;
const KPI_ROW_BOTTOM = { height: 18, display: "flex", alignItems: "center" } as const;
const KPI_LABEL = { fontSize: 13, fontWeight: 500, color: "#475569" } as const;
const KPI_CAPTION = { fontSize: 13, color: "#64748B" } as const;
const KPI_VALUE = {
  fontFamily: SANS,
  fontSize: 32,
  fontWeight: 600,
  lineHeight: 1,
  letterSpacing: "-0.02em",
  fontVariantNumeric: "tabular-nums",
  color: "#0F172A",
} as const;

/** Menu kecil Export Report (portal supaya tidak terpotong overflow card). */
export function ExportMenu({
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
        className="btn-radius-10"
        style={{
          ...HEADER_BTN,
          padding: "0 16px",
          background: "#FFC348",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.55 : 1,
        }}
        onMouseEnter={(e) => {
          if (!disabled) e.currentTarget.style.background = "#F0B53D";
        }}
        onMouseLeave={(e) => {
          if (!disabled) e.currentTarget.style.background = "#FFC348";
        }}
      >
        <Download size={16} aria-hidden="true" />
        Export Report
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
export type QaPeriodSelection = {
  mode: PeriodMode;
  year: number;
  quarter: number;
  month: number;
};

/** Label ringkas periode dari nilai yang berlaku (mis. "Q4 2026"). */
export function periodLabelOf(p: QaPeriodSelection): string {
  if (p.mode === "month") return `${MONTH_NAMES[p.month - 1]} ${p.year}`;
  if (p.mode === "quarter") return `Q${p.quarter} ${p.year}`;
  return String(p.year);
}

/** Nilai default periode: quarter berjalan (bulan/tahun saat ini). */
export function defaultQaPeriod(): QaPeriodSelection {
  const now = new Date();
  return {
    mode: "quarter",
    year: now.getUTCFullYear(),
    quarter: Math.floor(now.getUTCMonth() / MONTHS_PER_QUARTER) + 1,
    month: now.getUTCMonth() + 1,
  };
}


/* ------------------------------ Member table -------------------------- */

const th = {
  padding: "12px 10px",
  fontSize: 12,
  fontWeight: 500,
  color: "#64748B",
  textAlign: "right",
  whiteSpace: "nowrap",
} as const;
const td = { padding: "14px 10px", verticalAlign: "middle" } as const;

/** Sel angka: Geist Mono #334155; nilai 0 → muted. */
function NumCell({ value }: { value: number }) {
  return (
    <td style={{ ...td, fontFamily: MONO, fontWeight: 500, color: value === 0 ? "#94A3B8" : "#334155" }}>
      {fmt(value)}
    </td>
  );
}

function MemberRow({ member }: { member: QaPerformanceMember }) {
  const tone = BADGE_COLOR[member.badge];
  const name = member.name ?? "(tanpa nama)";

  return (
    <tr style={{ borderBottom: `1px solid ${ROW_DIVIDER}` }}>
      {/* QA member: avatar netral + nama + role */}
      <td style={{ ...td, paddingLeft: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <span
            aria-hidden="true"
            style={{
              width: 34,
              height: 34,
              borderRadius: "50%",
              background: "#EEF1F5",
              color: "#334155",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            {initialsOf(name)}
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
            <span
              title={name}
              style={{
                fontSize: 14,
                fontWeight: 500,
                color: "#0F172A",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {name}
            </span>
            <span style={{ fontSize: 12, color: "#64748B" }}>{member.roleLabel}</span>
          </div>
        </div>
      </td>

      <NumCell value={member.assignedRuns} />
      <NumCell value={member.executedCases} />
      <NumCell value={member.createdCases} />

      {/* Pass rate: angka polos, tanpa bar */}
      <td style={{ ...td, fontFamily: MONO, fontWeight: 600, color: passRateColor(member.passRate) }}>
        {member.passRate === null ? "—" : `${member.passRate}%`}
      </td>

      <NumCell value={member.bugsFound} />

      <td style={{ ...td, fontFamily: MONO, fontSize: 15, fontWeight: 600, color: "#0F172A" }}>
        {fmt(member.score)}
      </td>

      {/* Status: dot + teks, warna sama, tanpa pill */}
      <td style={{ ...td, textAlign: "left", paddingLeft: 28, paddingRight: 22 }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            color: tone,
            fontSize: 13,
            fontWeight: 600,
            whiteSpace: "nowrap",
          }}
        >
          <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: "50%", background: tone, flexShrink: 0 }} />
          {BADGE_LABEL[member.badge]}
        </span>
      </td>
    </tr>
  );
}

/**
 * QA Performance Analytics — hanya dirender untuk Lead QA (gerbang di page).
 *
 * Catatan metrik: "Avg. Execution Time" sengaja tidak ditampilkan karena sistem
 * belum menyimpan durasi eksekusi (tidak ada kolom startedAt/finishedAt), dan
 * atribusi eksekusi memakai `TestRunResult.updatedById` = pengubah terakhir.
 */
export function QaPerformanceView({ data }: { data: QaPerformancePayload }) {
  const totals = data.totals;

  return (
    <>
      {/* KPI row — struktur 3 baris seragam */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
        <div style={KPI_CARD}>
          <div style={KPI_ROW_LABEL}>
            <span style={KPI_LABEL}>Total Executed Test Cases</span>
          </div>
          <span style={KPI_VALUE}>{fmt(totals.executedCases)}</span>
          <div style={KPI_ROW_BOTTOM}>
            <span style={KPI_CAPTION}>Eksekusi (status ≠ Not run) pada periode ini</span>
          </div>
        </div>

        <div style={KPI_CARD}>
          <div style={KPI_ROW_LABEL}>
            <span style={KPI_LABEL}>Average Pass Rate</span>
          </div>
          <span style={{ ...KPI_VALUE, color: totals.passRate === null ? "#94A3B8" : "#15803D" }}>
            {totals.passRate === null ? "—" : `${totals.passRate}%`}
          </span>
          <div style={KPI_ROW_BOTTOM}>
            <span style={KPI_CAPTION}>
              {totals.passRate === null
                ? "Belum ada hasil Pass/Fail di periode ini"
                : "Pass ÷ (Pass + Fail), agregat tim"}
            </span>
          </div>
        </div>

        <div style={KPI_CARD}>
          <div style={KPI_ROW_LABEL}>
            <span style={KPI_LABEL}>Total Bugs Reported</span>
          </div>
          <span style={KPI_VALUE}>{fmt(totals.bugsReported)}</span>
          <div style={KPI_ROW_BOTTOM}>
            <span style={KPI_CAPTION}>Bug yang dilaporkan pada periode ini</span>
          </div>
        </div>
      </div>

      {/* Tabel performa member — mengisi sisa tinggi halaman */}
      <div
        style={{
          ...cardStyle,
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {data.members.length === 0 ? (
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "2.5rem 1.5rem",
              textAlign: "center",
              fontSize: 13,
              color: "#94A3B8",
            }}
          >
            Belum ada aktivitas QA pada periode ini. Coba pilih periode lain.
          </div>
        ) : (
          <div style={{ flex: 1, minHeight: 0, overflowX: "auto" }}>
            <table
              style={{ width: "100%", minWidth: 980, tableLayout: "fixed", borderCollapse: "collapse", fontSize: 14 }}
            >
              <colgroup>
                <col />
                <col style={{ width: 120 }} />
                <col style={{ width: 130 }} />
                <col style={{ width: 120 }} />
                <col style={{ width: 110 }} />
                <col style={{ width: 110 }} />
                <col style={{ width: 90 }} />
                <col style={{ width: 190 }} />
              </colgroup>
              <thead>
                <tr style={{ background: HEAD_BG, borderBottom: `1px solid ${LINE}` }}>
                  <th style={{ ...th, textAlign: "left", paddingLeft: 22 }}>QA member</th>
                  <th style={th}>Assigned runs</th>
                  <th style={th}>Executed cases</th>
                  <th style={th}>TCs created</th>
                  <th style={th}>Pass rate</th>
                  <th style={th}>Bugs found</th>
                  <th style={th}>Score</th>
                  <th style={{ ...th, textAlign: "left", paddingLeft: 28, paddingRight: 22 }}>Status</th>
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
      </div>
    </>
  );
}
