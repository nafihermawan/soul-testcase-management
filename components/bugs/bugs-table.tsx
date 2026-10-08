"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ExternalLink, Plus, Search, Trash2 } from "lucide-react";
import { deleteBug, updateBugStatus } from "@/lib/actions/automation-bugs";
import { ConfirmDialog, Toast, useToast } from "@/components/ui/feedback";
import { FilterModal } from "@/components/ui/filter-modal";
import { CustomSelect, filterLabelStyle } from "@/components/ui/custom-select";
import { MonthPicker } from "@/components/ui/month-picker";
import { Select } from "@/components/ui/select";
import { BugDetailModal } from "@/components/bugs/bug-detail-modal";
import { ReportGeneralBugModal } from "@/components/bugs/report-general-bug-modal";
import { HistoryPagination } from "@/components/test-runs/history-pagination";
import { entityCode } from "@/lib/format";
import { ENVIRONMENT_OPTIONS } from "@/lib/qa-metrics";
import type { AttachmentItem, BugSourceType } from "@/types/api";

export type BugRow = {
  id: string;
  title: string;
  description: string | null;
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
  severity: string | null;
  /** Tempat bug ditemukan (DEV/STG/PRE-PROD/PROD); null = belum diketahui. */
  environment?: string | null;
  externalLink: string | null;
  createdAt: string;
  testCase: { id: string; tcId: string; title: string } | null;
  /** Suite/Module tempat bug berada; null = tidak diketahui (mis. temuan tanpa suite). */
  suite?: { id: string; name: string } | null;
  /** Test Run tempat bug ditemukan; null untuk temuan ad-hoc.
   *  `environment` run dipakai sebagai fallback bila bug.environment kosong. */
  run?: { id: string; name: string; environment?: string | null } | null;
  createdBy: { name: string | null } | null;
  attachments?: AttachmentItem[];
  /**
   * EXECUTION kalau bug punya rujukan TC, GENERAL_FINDING kalau temuan ad-hoc.
   * Opsional karena payload yang lebih lama (dari cache klien) belum memuatnya.
   */
  sourceType?: BugSourceType;
};

type BugTab = "ALL" | BugSourceType;

/** Jumlah baris per halaman; sengaja tetap (tanpa opsi ubah dari UI). */
const BUGS_PER_PAGE = 25;

/**
 * Lebar kolom beku ID (px) — sekaligus offset `left` kolom "Title & Linked TC"
 * yang ikut di-sticky. Dipakai di <colgroup> supaya lebarnya presisi.
 */
const STICKY_ID_WIDTH = 130;

/** Batas lebar kolom "Title & Linked TC" yang bisa ditarik (px). */
const TITLE_DEFAULT_WIDTH = 320;
const TITLE_MIN_WIDTH = 280;
const TITLE_MAX_WIDTH = 600;

/** Total lebar kolom SELAIN Title (ID + kolom tetap) — dasar minWidth tabel.
 *  Kolom Created Date dipatok 112px (w-28) agar tidak terpotong tepi kanan. */
const FIXED_COLUMNS_WIDTH =
  STICKY_ID_WIDTH + 190 + 120 + 110 + 100 + 140 + 140 + 112 + 70;

/**
 * Klasifikasi sumber bug. Field `sourceType` dari API dipakai kalau ada, tapi
 * selalu ada fallback ke relasi `testCase` — aturannya memang diturunkan dari
 * situ, jadi bug tidak akan salah kategori hanya karena payload-nya belum
 * memuat field baru (mis. data basi dari cache klien).
 */
const sourceTypeOf = (b: BugRow): BugSourceType =>
  b.sourceType ?? (b.testCase ? "EXECUTION" : "GENERAL_FINDING");

/** Urutan tampilan: status aktif di atas, selesai di bawah. */
const BUG_STATUS_RANK: Record<BugRow["status"], number> = {
  OPEN: 0,
  IN_PROGRESS: 1,
  RESOLVED: 2,
  CLOSED: 3,
};

/**
 * Warna & bobot teks status bug (teks polos, tanpa pill/box).
 * Alur status: Open → In Progress → Closed. 'Resolved' sudah dihapus dari
 * dropdown; entri RESOLVED di bawah hanya fallback tampilan (legacy).
 */
const statusStyle: Record<BugRow["status"], { color: string; weight: number }> = {
  OPEN: { color: "#E11D48", weight: 600 }, // rose-600
  IN_PROGRESS: { color: "#D97706", weight: 600 }, // amber-600
  RESOLVED: { color: "#047857", weight: 500 }, // legacy → tampil seperti Closed
  CLOSED: { color: "#047857", weight: 500 }, // emerald-700, medium
};

/** Warna teks severity bug (teks polos, tanpa pill/box). */
const severityColor: Record<string, string> = {
  CRITICAL: "#DC2626", // red-600
  HIGH: "#D97706", // amber-600
  MEDIUM: "#2563EB", // blue-600
  LOW: "#64748B", // slate-500
};

export function BugsPageClient({
  bugs,
  canAttach = false,
}: {
  bugs: BugRow[];
  /** Upload evidence butuh role QA — server action-nya akan redirect kalau bukan. */
  canAttach?: boolean;
}) {
  const [deleteTarget, setDeleteTarget] = useState<BugRow | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  /** Bug yang detailnya sedang dibuka di modal (klik baris tabel). */
  const [detailBugId, setDetailBugId] = useState<string | null>(null);
  /** Tab sumber bug: semua / dari eksekusi TC / temuan ad-hoc. */
  const [tab, setTab] = useState<BugTab>("ALL");
  const [reportOpen, setReportOpen] = useState(false);
  // Pagination tabel: ukuran halaman dikunci (tanpa pemilih "Rows per page").
  const [page, setPage] = useState(1);
  const { toast, showToast, dismissToast } = useToast();
  // Cermin lokal daftar bug: upload/hapus evidence cukup memperbarui barisnya
  // sendiri (tanpa refetch halaman, supaya modal & posisi scroll tidak hilang).
  const [localBugs, setLocalBugs] = useState<BugRow[]>(bugs);
  useEffect(() => {
    setLocalBugs(bugs);
  }, [bugs]);

  /** Patch satu baris bug di daftar lokal (status / field lain). */
  const patchBug = (bugId: string, patch: Partial<BugRow>) => {
    setLocalBugs((prev) => prev.map((b) => (b.id === bugId ? { ...b, ...patch } : b)));
  };

  // Filter pencarian header banner
  const [query, setQuery] = useState("");
  // Filter yang sudah DITERAPKAN (committed).
  const [sevFilter, setSevFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [envFilter, setEnvFilter] = useState<string>("");
  /** Periode laporan "YYYY-MM" (filter bulan pembuatan bug); "" = semua. */
  const [monthFilter, setMonthFilter] = useState<string>("");
  // Draft filter: baru berlaku setelah tombol Terapkan di modal filter diklik.
  const [draftSev, setDraftSev] = useState("");
  const [draftStatus, setDraftStatus] = useState("");
  const [draftEnv, setDraftEnv] = useState("");
  const [draftMonth, setDraftMonth] = useState("");

  // Sinkronkan draft bila filter yang berlaku berubah dari luar (mis. reset).
  useEffect(() => {
    setDraftSev(sevFilter);
    setDraftStatus(statusFilter);
    setDraftEnv(envFilter);
    setDraftMonth(monthFilter);
  }, [sevFilter, statusFilter, envFilter, monthFilter]);

  /**
   * Lebar kolom "Title & Linked TC" (px) — bisa ditarik lewat resizer di border
   * kanannya. Lebar ini menggerakkan <colgroup> sekaligus minWidth tabel, jadi
   * saat kolom dilebarkan teks judul tampil penuh (ellipsis otomatis hilang).
   */
  const [titleWidth, setTitleWidth] = useState(TITLE_DEFAULT_WIDTH);
  const [resizingTitle, setResizingTitle] = useState(false);
  const [hoverTitleResizer, setHoverTitleResizer] = useState(false);
  const titleResizeStart = useRef<{ x: number; width: number } | null>(null);

  // Pantau geseran mouse selama drag; lepas saat mouseup (dan kunci kursor).
  useEffect(() => {
    if (!resizingTitle) return;
    const onMove = (e: MouseEvent) => {
      const s = titleResizeStart.current;
      if (!s) return;
      setTitleWidth(
        Math.min(TITLE_MAX_WIDTH, Math.max(TITLE_MIN_WIDTH, s.width + (e.clientX - s.x)))
      );
    };
    const onUp = () => setResizingTitle(false);
    const prevCursor = document.body.style.cursor;
    const prevSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevSelect;
    };
  }, [resizingTitle]);

  /** Kunci bulan lokal dari createdAt, mis. "2026-09". */
  const monthKeyOf = (iso: string): string => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };

  const q = query.trim().toLowerCase();
  const visibleBugs = localBugs.filter((b) => {
    if (tab !== "ALL" && sourceTypeOf(b) !== tab) return false;
    if (sevFilter && b.severity !== sevFilter) return false;
    if (statusFilter && b.status !== statusFilter) return false;
    if (envFilter && (b.environment ?? b.run?.environment ?? "") !== envFilter) return false;
    if (monthFilter && monthKeyOf(b.createdAt) !== monthFilter) return false;
    if (!q) return true;
    const hay = `${b.title} ${b.description ?? ""} ${b.testCase?.tcId ?? ""} ${b.testCase?.title ?? ""} ${b.createdBy?.name ?? ""}`.toLowerCase();
    return hay.includes(q);
  });

  // Urutkan: status aktif (Open → In Progress) di atas, Closed paling bawah;
  // tiebreak tetap bug terbaru lebih dulu.
  visibleBugs.sort((a, b) => {
    const ra = BUG_STATUS_RANK[a.status] ?? 9;
    const rb = BUG_STATUS_RANK[b.status] ?? 9;
    if (ra !== rb) return ra - rb;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  // Counter per tab tidak lagi ditampilkan di UI, cukup label teksnya.
  const tabs: { key: BugTab; label: string }[] = [
    { key: "ALL", label: "Semua Bug" },
    { key: "EXECUTION", label: "Test Run Bugs" },
    { key: "GENERAL_FINDING", label: "General Findings" },
  ];

  // Balik ke halaman 1 saat tab / pencarian / filter berubah supaya tidak
  // mendarat di halaman yang sudah kosong.
  useEffect(() => {
    setPage(1);
  }, [tab, query, sevFilter, statusFilter, envFilter, monthFilter]);

  // `page` bisa tertinggal di halaman yang sudah tidak ada (mis. bug terakhir di
  // halaman terakhir dihapus) -> pakai halaman efektif yang di-clamp.
  const totalPages = Math.max(1, Math.ceil(visibleBugs.length / BUGS_PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const pagedBugs = visibleBugs.slice((currentPage - 1) * BUGS_PER_PAGE, currentPage * BUGS_PER_PAGE);

  /**
   * Ubah status bug langsung di barisnya. Server tetap yang menulis (termasuk
   * auto-PASS hasil run yang FAIL); daftar lokal di-patch di tempat supaya
   * halaman tidak tertukar ke skeleton hanya karena satu baris berubah.
   */
  const changeStatus = async (bugId: string, status: BugRow["status"]) => {
    const res = await updateBugStatus(bugId, status);
    if (res?.error) {
      showToast(res.error, "error");
      return;
    }
    patchBug(bugId, { status });
  };

  const removeBug = async () => {
    if (!deleteTarget) return;
    const targetId = deleteTarget.id;
    setDeletePending(true);
    const res = await deleteBug(targetId);
    setDeletePending(false);
    setDeleteTarget(null);
    if (res?.error) {
      showToast(res.error, "error");
      return;
    }
    setLocalBugs((prev) => prev.filter((b) => b.id !== targetId));
    showToast("Bug dihapus.", "success");
  };

  return (
    <>
      {/* Header Card Banner */}
      <div
        style={{
          background: "#FFFFFF",
          borderRadius: 12,
          border: "1px solid #E5E7EB",
          boxShadow: "0px 1px 2px rgba(16, 24, 40, 0.04), 0px 4px 12px rgba(16, 24, 40, 0.06)",
          padding: "20px 24px",
          marginBottom: 20,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h1
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: "#1E293B",
              letterSpacing: "-0.025em",
              margin: 0,
              lineHeight: 1.2,
            }}
          >
            Bugs Tracker
          </h1>
          <p
            style={{
              fontSize: 12,
              fontWeight: 400,
              color: "#64748B",
              margin: "4px 0 0",
            }}
          >
            Daftar bug dari hasil eksekusi test case maupun temuan ad-hoc. Ubah status untuk melacak penyelesaian.
          </p>
        </div>
      </div>

      {/* Tab sumber bug */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          borderBottom: "1px solid #E2E8F0",
          marginBottom: "1rem",
        }}
      >
        {tabs.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              aria-pressed={active}
              onClick={() => setTab(t.key)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                padding: "0.625rem 1rem",
                marginBottom: -1,
                border: "none",
                borderBottom: active ? "2px solid #FFC348" : "2px solid transparent",
                background: "transparent",
                color: active ? "#0F172A" : "#64748B",
                fontWeight: active ? 700 : 500,
                fontSize: "0.75rem",
                cursor: "pointer",
                transition: "color 0.15s ease",
              }}
              onMouseEnter={(e) => {
                if (!active) e.currentTarget.style.color = "#334155";
              }}
              onMouseLeave={(e) => {
                if (!active) e.currentTarget.style.color = "#64748B";
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Control bar: pencarian, filter, dan aksi laporkan bug */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: "0.5rem",
          flexWrap: "wrap",
          marginBottom: "1rem",
        }}
      >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              // Tinggi dikunci 32px (h-8) + padding horizontal saja, agar sejajar
              // dengan tombol Filter & Laporkan Bug di sebelahnya.
              height: 32,
              padding: "0 0.7rem",
              borderRadius: 8,
              border: "1px solid #D1D5DB",
              background: "#fff",
            }}
          >
            <Search size={14} color="#9CA3AF" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari bug…"
              style={{ border: "none", outline: "none", fontSize: "0.8rem", width: 180, background: "transparent" }}
            />
          </div>
          <FilterModal
            title="Filter Bugs"
            activeCount={
              (sevFilter ? 1 : 0) +
              (statusFilter ? 1 : 0) +
              (envFilter ? 1 : 0) +
              (monthFilter ? 1 : 0)
            }
            onReset={() => {
              setDraftSev("");
              setDraftStatus("");
              setDraftEnv("");
              setDraftMonth("");
            }}
            onApply={() => {
              setSevFilter(draftSev);
              setStatusFilter(draftStatus);
              setEnvFilter(draftEnv);
              setMonthFilter(draftMonth);
            }}
          >
            <div>
              <span style={filterLabelStyle}>Severity</span>
              <CustomSelect
                ariaLabel="Filter severity"
                value={draftSev}
                onChange={setDraftSev}
                options={[
                  { value: "", label: "Semua Severity" },
                  { value: "CRITICAL", label: "Critical" },
                  { value: "HIGH", label: "High" },
                  { value: "MEDIUM", label: "Medium" },
                  { value: "LOW", label: "Low" },
                ]}
              />
            </div>

            <div>
              <span style={filterLabelStyle}>Status</span>
              <CustomSelect
                ariaLabel="Filter status"
                value={draftStatus}
                onChange={setDraftStatus}
                options={[
                  { value: "", label: "Semua Status" },
                  { value: "OPEN", label: "Open" },
                  { value: "IN_PROGRESS", label: "In Progress" },
                  { value: "CLOSED", label: "Closed" },
                ]}
              />
            </div>

            <div>
              <span style={filterLabelStyle}>Environment</span>
              <CustomSelect
                ariaLabel="Filter environment"
                value={draftEnv}
                onChange={setDraftEnv}
                options={[
                  { value: "", label: "Semua Environment" },
                  ...ENVIRONMENT_OPTIONS.map((env) => ({ value: env, label: env })),
                ]}
              />
            </div>

            <div>
              <span style={filterLabelStyle}>Periode Laporan</span>
              <MonthPicker
                ariaLabel="Filter periode laporan"
                value={draftMonth}
                onChange={setDraftMonth}
              />
            </div>
          </FilterModal>
          {/* Tombol lapor bug hanya relevan di tab General Findings */}
          {tab === "GENERAL_FINDING" && (
            <button
              type="button"
              onClick={() => setReportOpen(true)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                // Samakan tinggi dengan search bar & tombol Filter (h-8).
                height: 32,
                padding: "0 1rem",
                borderRadius: 8,
                border: "none",
                background: "#FFC348",
                color: "#0F172A",
                fontSize: "0.75rem",
                fontWeight: 700,
                boxShadow: "0 1px 2px rgba(15, 23, 42, 0.08)",
                cursor: "pointer",
                transition: "background-color 0.15s ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#F0B53D")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "#FFC348")}
            >
              <Plus size={14} /> Laporkan Bug
            </button>
          )}
        </div>

      {/* Daftar Bug Table */}
      {visibleBugs.length === 0 ? (
        <div
          style={{
            background: "#fff",
            border: "1px solid #E5E7EB",
            borderRadius: 12,
            boxShadow: "0px 1px 2px rgba(16, 24, 40, 0.04)",
            padding: "3rem 1.5rem",
            textAlign: "center",
            color: "var(--text-muted)",
            fontSize: "0.9rem",
          }}
        >
          {bugs.length === 0
            ? "Belum ada bug yang tercatat di sistem."
            : tab === "ALL"
              ? "Tidak ada bug yang cocok dengan pencarian / filter."
              : `Belum ada bug pada kategori ${tab === "EXECUTION" ? "Test Run Bugs" : "General Findings"}.`}
        </div>
      ) : (
        <div
          style={{
            background: "#fff",
            border: "1px solid #E5E7EB",
            borderRadius: 12,
            boxShadow: "0px 1px 2px rgba(16, 24, 40, 0.04)",
            overflow: "hidden",
          }}
        >
          <div style={{ overflow: "auto", maxHeight: 620 }}>
            <table
              className="bugs-table"
              style={{
                width: "100%",
                // Lebar minimum tumbuh mengikuti titleWidth supaya saat kolom
                // Title dilebarkan tabel ikut melebar, bukan menekan kolom lain.
                minWidth: Math.max(1280, FIXED_COLUMNS_WIDTH + titleWidth),
                borderCollapse: "collapse",
                // Seluruh teks tabel (th & td) dipatok 12px (text-xs); nilai
                // ini jadi basis semua sel supaya seragam.
                fontSize: 12,
                tableLayout: "fixed",
              }}
            >
              {/* Lebar kolom tetap supaya offset `left` kolom beku presisi.
                  Kolom Title diambil dari state (bisa di-resize). */}
              <colgroup>
                <col style={{ width: STICKY_ID_WIDTH }} />
                <col style={{ width: titleWidth }} />
                <col style={{ width: 190 }} />
                <col style={{ width: 120 }} />
                <col style={{ width: 110 }} />
                <col style={{ width: 100 }} />
                <col style={{ width: 140 }} />
                <col style={{ width: 140 }} />
                <col style={{ width: 112 }} />
                <col style={{ width: 70 }} />
              </colgroup>
              <thead>
                <tr style={{ color: "#64748B", fontSize: 12, textAlign: "left", background: "#F8FAFC", borderBottom: "1px solid #E5E7EB", whiteSpace: "nowrap" }}>
                  <th
                    style={{
                      padding: "0.6rem 1.25rem",
                      fontWeight: 600,
                      position: "sticky",
                      left: 0,
                      top: 0,
                      zIndex: 20,
                      background: "#F8FAFC",
                    }}
                  >
                    ID
                  </th>
                  <th
                    style={{
                      padding: "0.6rem 0.5rem",
                      fontWeight: 600,
                      position: "sticky",
                      left: STICKY_ID_WIDTH,
                      top: 0,
                      zIndex: 20,
                      background: "#F8FAFC",
                      boxShadow: "2px 0 5px -2px rgba(0, 0, 0, 0.1)",
                    }}
                  >
                    Title & Linked TC
                    {/* Resizer: garis tipis di border kanan kolom Title;
                        menyala indigo saat hover/drag. `position: absolute`
                        relatif ke th (sticky = positioned). */}
                    <span
                      role="separator"
                      aria-orientation="vertical"
                      aria-label="Ubah lebar kolom Title"
                      title="Tarik untuk mengubah lebar kolom"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        titleResizeStart.current = { x: e.clientX, width: titleWidth };
                        setResizingTitle(true);
                      }}
                      onMouseEnter={() => setHoverTitleResizer(true)}
                      onMouseLeave={() => setHoverTitleResizer(false)}
                      style={{
                        position: "absolute",
                        top: 0,
                        right: -4,
                        width: 9,
                        height: "100%",
                        zIndex: 30,
                        display: "flex",
                        justifyContent: "center",
                        cursor: "col-resize",
                        userSelect: "none",
                        touchAction: "none",
                      }}
                    >
                      <span
                        aria-hidden="true"
                        style={{
                          width: 2,
                          height: "100%",
                          // Garis default transparan (tak terlihat); muncul amber
                          // saat area resizer di-hover atau sedang di-drag.
                          background:
                            resizingTitle || hoverTitleResizer ? "#F59E0B" : "transparent",
                          transition: "background-color 200ms ease",
                        }}
                      />
                    </span>
                  </th>
                  <th style={{ padding: "0.6rem 0.5rem", fontWeight: 600, textAlign: "center", position: "sticky", top: 0, zIndex: 20, background: "#F8FAFC" }}>Test Run</th>
                  <th style={{ padding: "0.6rem 0.5rem", fontWeight: 600, textAlign: "left", minWidth: 120, position: "sticky", top: 0, zIndex: 20, background: "#F8FAFC", whiteSpace: "nowrap" }}>Module</th>
                  <th style={{ padding: "0.6rem 0.5rem", fontWeight: 600, textAlign: "center", position: "sticky", top: 0, zIndex: 20, background: "#F8FAFC" }}>Environment</th>
                  <th style={{ padding: "0.6rem 0.5rem", fontWeight: 600, textAlign: "center", position: "sticky", top: 0, zIndex: 20, background: "#F8FAFC" }}>Severity</th>
                  <th style={{ padding: "0.6rem 0.5rem", fontWeight: 600, textAlign: "center", position: "sticky", top: 0, zIndex: 20, background: "#F8FAFC" }}>Status</th>
                  <th style={{ padding: "0.6rem 0.5rem", fontWeight: 600, textAlign: "center", position: "sticky", top: 0, zIndex: 20, background: "#F8FAFC" }}>Created By</th>
                  <th style={{ padding: "0.6rem 0.5rem", fontWeight: 600, textAlign: "center", position: "sticky", top: 0, zIndex: 20, background: "#F8FAFC" }}>Created Date</th>
                  <th style={{ padding: "0.6rem 1.25rem", fontWeight: 600, textAlign: "center", position: "sticky", top: 0, zIndex: 20, background: "#F8FAFC" }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {pagedBugs.map((b) => {
                  const st = statusStyle[b.status];
                  const sev = b.severity ? (severityColor[b.severity] ?? severityColor.LOW) : null;
                  // Environment bug; fallback ke environment Test Run terkait.
                  const env = b.environment ?? b.run?.environment ?? null;
                  return (
                    <tr
                      key={b.id}
                      onClick={() => setDetailBugId(b.id)}
                      style={{ borderTop: "1px solid var(--border)", cursor: "pointer", whiteSpace: "nowrap" }}
                    >
                      <td
                        className="bug-sticky-cell"
                        style={{
                          padding: "0.6rem 1.25rem",
                          position: "sticky",
                          left: 0,
                          zIndex: 10,
                        }}
                      >
                        <span
                          style={{
                            fontFamily: "var(--font-mono, monospace)",
                            color: "#94A3B8",
                            fontWeight: 400,
                            fontSize: 12,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {entityCode("BUG", b.id)}
                        </span>
                      </td>
                      <td
                        className="bug-sticky-cell"
                        style={{
                          padding: "0.6rem 0.5rem",
                          position: "sticky",
                          left: STICKY_ID_WIDTH,
                          zIndex: 10,
                          boxShadow: "2px 0 5px -2px rgba(0, 0, 0, 0.1)",
                          overflow: "hidden",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", minWidth: 0 }}>
                          <span
                            title={b.title}
                            style={{
                              fontWeight: 500,
                              fontSize: 12,
                              color: "#1E293B",
                              lineHeight: 1.4,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              minWidth: 0,
                            }}
                          >
                            {b.title}
                          </span>
                          {b.externalLink && (
                            <a
                              href={b.externalLink}
                              target="_blank"
                              rel="noreferrer"
                              title={b.externalLink}
                              onClick={(e) => e.stopPropagation()}
                              style={{ display: "inline-flex", alignItems: "center", color: "var(--brand-600)", textDecoration: "none", flexShrink: 0 }}
                            >
                              <ExternalLink size={13} />
                            </a>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: "0.6rem 0.5rem", textAlign: "center", overflow: "hidden" }}>
                        {b.run && b.run.name ? (
                          <Link
                            href={`/test-runs/${b.run.id}`}
                            onClick={(e) => e.stopPropagation()}
                            title={b.run.name}
                            style={{
                              display: "inline-block",
                              fontSize: 12,
                              fontWeight: 600,
                              color: "#2563EB",
                              textDecoration: "none",
                              maxWidth: "100%",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              verticalAlign: "bottom",
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
                            onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
                          >
                            {b.run.name}
                          </Link>
                        ) : (
                          // Temuan ad-hoc (tanpa Test Run) — label muted, bukan "-"
                          // yang terkesan data kosong.
                          <span style={{ fontSize: 12, fontWeight: 400, color: "#94A3B8" }}>
                            Ad-hoc / General
                          </span>
                        )}
                      </td>
                      {/* Module / Suite — "—" muted bila bug tidak punya suite. */}
                      <td
                        title={b.suite?.name ?? undefined}
                        style={{
                          padding: "0.6rem 0.5rem",
                          textAlign: "left",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          fontSize: 12,
                          fontWeight: 500,
                          color: "#475569",
                        }}
                      >
                        {b.suite?.name ?? (
                          <span style={{ color: "#94A3B8", fontWeight: 400 }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: "0.6rem 0.5rem", textAlign: "center", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {env ? (
                          <span style={{ fontSize: 12, fontWeight: 600, color: "#475569", whiteSpace: "nowrap" }}>
                            {env}
                          </span>
                        ) : (
                          <span style={{ color: "#94A3B8" }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: "0.6rem 0.5rem", textAlign: "center" }}>
                        {sev ? (
                          <span style={{ fontSize: 12, fontWeight: 600, color: sev }}>
                            {b.severity}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td style={{ padding: "0.6rem 0.5rem", textAlign: "center" }}>
                        <span onClick={(e) => e.stopPropagation()} style={{ display: "inline-flex", maxWidth: 130 }}>
                          <Select
                            size="sm"
                            value={b.status}
                            ariaLabel="Ubah status bug"
                            style={{
                              background: "transparent",
                              border: "none",
                              borderRadius: 0,
                              padding: 0,
                              boxShadow: "none",
                              width: "auto",
                              fontSize: 12,
                              fontWeight: st.weight,
                              color: st.color,
                            }}
                            onChange={(e) => changeStatus(b.id, e.target.value as BugRow["status"])}
                          >
                            <option value="OPEN">Open</option>
                            <option value="IN_PROGRESS">In Progress</option>
                            <option value="CLOSED">Closed</option>
                          </Select>
                        </span>
                      </td>
                      <td style={{ padding: "0.6rem 0.5rem", textAlign: "center", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {b.createdBy?.name ?? "—"}
                      </td>
                      <td style={{ padding: "0.6rem 0.5rem", textAlign: "center", color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {new Date(b.createdAt).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}
                      </td>
                      <td style={{ padding: "0.6rem 1.25rem", textAlign: "center" }}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget(b);
                          }}
                          title="Hapus bug"
                          aria-label="Hapus bug"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: 30,
                            height: 30,
                            borderRadius: 8,
                            border: "none",
                            background: "transparent",
                            color: "#94A3B8",
                            cursor: "pointer",
                            transition: "color 0.15s ease",
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = "#E11D48")}
                          onMouseLeave={(e) => (e.currentTarget.style.color = "#94A3B8")}
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {visibleBugs.length > 0 && (
            <HistoryPagination
              total={visibleBugs.length}
              page={currentPage}
              perPage={BUGS_PER_PAGE}
              baseUrl="/bugs"
              label="Bug"
              lockPerPage
              onPageChange={setPage}
            />
          )}
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Hapus Bug?"
        message={
          <>
            Bug <strong>{deleteTarget?.title}</strong> akan dihapus permanen.
          </>
        }
        pending={deletePending}
        onConfirm={removeBug}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Modal detail bug — dibuka dengan klik salah satu baris tabel */}
      {detailBugId && (
        <BugDetailModal
          bugId={detailBugId}
          onClose={() => setDetailBugId(null)}
          onUpdated={patchBug}
        />
      )}

      {/* Modal lapor bug ad-hoc (General Findings) */}
      {reportOpen && (
        <ReportGeneralBugModal
          canAttach={canAttach}
          onClose={() => setReportOpen(false)}
          onCreated={(bug, warning) => {
            if (bug) setLocalBugs((prev) => [bug, ...prev]);
            showToast(
              warning ?? (bug ? "Bug berhasil dilaporkan." : "Bug dibuat — refresh halaman untuk melihatnya."),
              warning || !bug ? "error" : "success"
            );
          }}
        />
      )}

      <Toast toast={toast} onDismiss={dismissToast} />
    </>
  );
}
