"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  FileText,
  Play,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { deleteBug, updateBugStatus } from "@/lib/actions/automation-bugs";
import {
  RowActionsMenu,
  type RowAction,
} from "@/components/settings/row-actions-menu";
import { ConfirmDialog, Toast, useToast } from "@/components/ui/feedback";
import { FilterModal } from "@/components/ui/filter-modal";
import {
  FilterField,
  FilterFieldsPair,
  FilterMonth,
  FilterSelect,
} from "@/components/ui/filter-fields";
import { BugDetailModal } from "@/components/bugs/bug-detail-modal";
import { ReportGeneralBugModal } from "@/components/bugs/report-general-bug-modal";
import { entityCode } from "@/lib/format";
import { ENVIRONMENT_OPTIONS, bugSlaDays, isBugOverdue } from "@/lib/qa-metrics";
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
  /** Hasil yang diharapkan (diisi reporter) — dipakai laporan PDF bug. */
  expectedResult?: string | null;
  /** Prasyarat bug (kolom `Bug.precondition`) — dipakai laporan PDF bug. */
  precondition?: string | null;
  testCase: {
    id: string;
    tcId: string;
    title: string;
    /** Prasyarat TC — dipakai laporan PDF bug. */
    precondition?: string | null;
    expectedResult?: string | null;
  } | null;
  /** Suite/Module tempat bug berada; null = tidak diketahui (mis. temuan tanpa suite). */
  suite?: { id: string; name: string } | null;
  /** Nama modul hasil resolusi server (fallback snapshot saat suite dihapus). */
  suiteName?: string | null;
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

/* ------------------------------- Tokens ------------------------------- */

const SANS = '"Geist", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
const MONO = '"Geist Mono", ui-monospace, monospace';

const CARD_BORDER = "#E3E7EE";
const HEADER_DIVIDER = "#E8ECF1";
const LINE = "#EEF1F5";
const ROW_DIVIDER = "#F1F4F8";
const HEAD_BG = "#F8FAFC";
const PAGER_BG = "#FAFBFC";
const YELLOW = "#FFC348";
const LINK = "#1D4ED8";
const LINK_HOVER = "#1E3A8A";

/** Gaya angka (bug ID & nomor halaman): Geist Mono. */
const mono: CSSProperties = { fontFamily: MONO };

/** Label aksesibilitas yang disembunyikan secara visual. */
const srOnly: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
};

/** Severity: kotak 8px + teks (Title Case), tanpa pill. */
const SEVERITY: Record<string, { square: string; text: string; label: string }> = {
  CRITICAL: { square: "#B91C1C", text: "#B91C1C", label: "Critical" },
  HIGH: { square: "#EA580C", text: "#C2410C", label: "High" },
  MEDIUM: { square: "#CA8A04", text: "#854D0E", label: "Medium" },
  LOW: { square: "#64748B", text: "#475569", label: "Low" },
};

/** Status: label + warna titik (tanpa pill). RESOLVED = legacy → tampil Closed. */
const STATUS_LABEL: Record<string, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  CLOSED: "Closed",
  RESOLVED: "Closed",
};
const STATUS_DOT: Record<string, string> = {
  OPEN: "#C2410C",
  IN_PROGRESS: "#1D4ED8",
  CLOSED: "#15803D",
  RESOLVED: "#15803D",
};

const statusLabelOf = (s: BugRow["status"]) => STATUS_LABEL[s] ?? s;
const statusDotOf = (s: BugRow["status"]) => STATUS_DOT[s] ?? "#64748B";

/** Warna environment: PROD = danger, lainnya netral. */
const envColor = (env: string) => (env.toUpperCase() === "PROD" ? "#B91C1C" : "#475569");

/** Tanggal ringkas berbahasa Indonesia, mis. "09 Okt 2026". */
const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });

/** Inisial avatar: huruf pertama dari maksimal 2 kata. */
function initialsOf(name: string | null | undefined): string {
  if (!name) return "—";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");
}

/**
 * Klasifikasi sumber bug. Field `sourceType` dari API dipakai kalau ada, tapi
 * selalu ada fallback ke relasi `testCase` — aturannya memang diturunkan dari
 * situ, jadi bug tidak akan salah kategori hanya karena payload-nya belum
 * memuat field baru (mis. data basi dari cache klien).
 */
const sourceTypeOf = (b: BugRow): BugSourceType =>
  b.sourceType ?? (b.testCase ? "EXECUTION" : "GENERAL_FINDING");

/**
 * Nama Module yang ditampilkan. `suiteName` sudah diresolusi server (nama suite
 * hidup, atau snapshot setelah suite dihapus); relasi `suite` jadi fallback
 * untuk payload lama/cache klien.
 */
const moduleNameOf = (b: BugRow): string => b.suiteName ?? b.suite?.name ?? "—";

/** Urutan tampilan: status aktif di atas, selesai di bawah. */
const BUG_STATUS_RANK: Record<BugRow["status"], number> = {
  OPEN: 0,
  IN_PROGRESS: 1,
  RESOLVED: 2,
  CLOSED: 3,
};

/* ------------------------------ Primitives ---------------------------- */

function Square({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }}
    />
  );
}

function Dot({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0 }}
    />
  );
}

/** Tombol status yang membuka menu ubah status (Open / In Progress / Closed). */
function StatusMenu({
  status,
  onSelect,
}: {
  status: BugRow["status"];
  onSelect: (next: BugRow["status"]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const openMenu = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 4, left: r.left });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t)) return;
      if ((e.target as HTMLElement).closest?.("[data-status-menu]")) return;
      setOpen(false);
    };
    const close = () => setOpen(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  const label = statusLabelOf(status);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="btn-radius-8"
        aria-label={`Ubah status: ${label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          if (open) setOpen(false);
          else openMenu();
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onMouseEnter={(e) => (e.currentTarget.style.background = "#F1F5F9")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
          height: 32,
          padding: "0 8px 0 10px",
          marginLeft: -10,
          border: "1px solid transparent",
          background: "transparent",
          fontSize: 13,
          fontWeight: 500,
          color: "#0F172A",
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        <Dot color={statusDotOf(status)} />
        {label}
        <ChevronDown size={14} color="#94A3B8" aria-hidden="true" />
      </button>

      {open &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            role="menu"
            data-status-menu
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              minWidth: 150,
              background: "#fff",
              border: "1px solid #E2E8F0",
              borderRadius: 10,
              boxShadow: "0 12px 24px -6px rgba(15, 23, 42, 0.18)",
              padding: 4,
              zIndex: 400,
              display: "flex",
              flexDirection: "column",
              gap: 2,
              animation: "dropdownIn 0.12s ease-out",
            }}
          >
            {(["OPEN", "IN_PROGRESS", "CLOSED"] as const).map((value) => {
              const active = value === status;
              return (
                <button
                  key={value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpen(false);
                    if (!active) onSelect(value);
                  }}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "7px 9px",
                    border: "none",
                    borderRadius: 6,
                    background: "transparent",
                    color: active ? "#0F172A" : "#334155",
                    fontSize: 13,
                    fontWeight: active ? 600 : 500,
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#F8FAFC")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <Dot color={statusDotOf(value)} />
                  <span style={{ flex: 1 }}>{statusLabelOf(value)}</span>
                  {active && <Check size={13} color="#B45309" aria-hidden="true" />}
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </>
  );
}

/* -------------------------------- Page -------------------------------- */

export function BugsPageClient({
  bugs,
  canAttach = false,
}: {
  bugs: BugRow[];
  /** Upload evidence butuh role QA — server action-nya akan redirect kalau bukan. */
  canAttach?: boolean;
}) {
  const router = useRouter();
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

  // Filter pencarian toolbar
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

  // Aksi "Test" (buat Express Run untuk re-test) hanya relevan untuk temuan
  // General Finding: tampil di tab General Findings (semua baris) & tab Semua Bug
  // (hanya baris ad-hoc). Di tab Test Run Bugs tidak pernah tampil.
  const testActionEnabled = tab !== "EXECUTION";

  /** Isi dropdown (kebab) kolom Aksi untuk satu baris bug. */
  const rowActionsFor = (b: BugRow): RowAction[] => {
    const actions: RowAction[] = [];
    if (testActionEnabled && sourceTypeOf(b) === "GENERAL_FINDING") {
      actions.push({
        label: "Test (Express Run)",
        icon: <Play size={15} />,
        iconColor: "#F59E0B",
        onClick: () => router.push(`/test-runs/create?bugId=${b.id}`),
      });
    }
    // Buka modal Detail Bug — di sana ada tombol "Export PDF".
    actions.push({
      label: "Detail / Export",
      icon: <FileText size={15} />,
      onClick: () => setDetailBugId(b.id),
    });
    actions.push({
      label: "Hapus Bug",
      icon: <Trash2 size={15} />,
      destructive: true,
      onClick: () => setDeleteTarget(b),
    });
    return actions;
  };

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

  // Jendela nomor halaman (maks 7 angka + elipsis), tanpa teks "Halaman x dari y".
  const pageItems: (number | "…")[] = [];
  const pushRange = (a: number, b: number) => {
    for (let i = a; i <= b; i++) pageItems.push(i);
  };
  if (totalPages <= 7) pushRange(1, totalPages);
  else {
    const lo = Math.max(1, currentPage - 1);
    const hi = Math.min(totalPages, currentPage + 1);
    if (lo > 2) pageItems.push(1, "…");
    else if (lo === 2) pageItems.push(1);
    pushRange(lo, hi);
    if (hi < totalPages - 1) pageItems.push("…", totalPages);
    else if (hi === totalPages - 1) pageItems.push(totalPages);
  }

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

  const th: CSSProperties = {
    padding: "11px 10px",
    fontSize: 12,
    fontWeight: 500,
    color: "#64748B",
    textAlign: "left",
    whiteSpace: "nowrap",
  };
  const td: CSSProperties = { padding: "12px 10px", verticalAlign: "middle" };
  const pagerBtn: CSSProperties = {
    width: 36,
    height: 36,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: "none",
    background: "transparent",
    padding: 0,
  };

  return (
    <>
      {/* Satu card mengisi seluruh area konten: Header → inset divider → Toolbar
          → Tabel (flex 1) → Pagination di dasar card. */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          background: "#ffffff",
          border: `1px solid ${CARD_BORDER}`,
          borderRadius: 18,
          overflow: "hidden",
          fontFamily: SANS,
          color: "#0F172A",
        }}
      >
        {/* Header */}
        <header
          style={{
            padding: "24px 22px 20px 22px",
            display: "flex",
            flexDirection: "column",
            gap: 6,
            flexShrink: 0,
          }}
        >
          <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em", color: "#0F172A", margin: 0, lineHeight: 1.2 }}>
            Bugs Tracker
          </h1>
          <p style={{ maxWidth: 720, fontSize: 14, lineHeight: 1.5, color: "#475569", margin: 0 }}>
            Daftar bug dari hasil eksekusi test case maupun temuan ad-hoc. Ubah status untuk melacak penyelesaian.
          </p>
        </header>

        {/* Inset divider (tidak full width — sejajar teks header & toolbar) */}
        <div style={{ margin: "0 22px", borderBottom: `1px solid ${HEADER_DIVIDER}`, flexShrink: 0 }} />

        {/* Toolbar: tab (kiri) + search/filter (kanan). Garis bawahnya full width
            dan menyambung ke header tabel. */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            padding: "4px 22px 0 22px",
            borderBottom: `1px solid ${LINE}`,
            flexShrink: 0,
          }}
        >
          <div role="tablist" aria-label="Sumber bug" style={{ display: "flex", gap: 24 }}>
            {tabs.map((t) => {
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(t.key)}
                  style={{
                    height: 56,
                    padding: 0,
                    border: "none",
                    borderBottom: `2px solid ${active ? YELLOW : "transparent"}`,
                    background: "transparent",
                    fontSize: 14,
                    fontWeight: active ? 600 : 500,
                    color: active ? "#0F172A" : "#64748B",
                    cursor: "pointer",
                    transition: "color 0.15s ease, border-color 0.15s ease",
                  }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", flexWrap: "wrap" }}>
            <label style={{ position: "relative", display: "inline-flex" }}>
              <span style={srOnly}>Cari bug</span>
              <Search
                size={16}
                color="#64748B"
                aria-hidden="true"
                style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
              />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cari bug…"
                style={{
                  width: 260,
                  height: 40,
                  borderRadius: 10,
                  border: "1px solid #DDE2E9",
                  background: "#ffffff",
                  fontSize: 14,
                  color: "#0F172A",
                  padding: "0 12px 0 36px",
                  boxSizing: "border-box",
                  outline: "none",
                }}
              />
            </label>

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
              <FilterFieldsPair>
                <FilterField label="Severity" htmlFor="filter-bugs-severity">
                  <FilterSelect
                    id="filter-bugs-severity"
                    icon="severity"
                    ariaLabel="Filter severity"
                    allValue=""
                    placeholder="Semua Severity"
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
                </FilterField>

                <FilterField label="Status" htmlFor="filter-bugs-status">
                  <FilterSelect
                    id="filter-bugs-status"
                    icon="status"
                    ariaLabel="Filter status"
                    allValue=""
                    placeholder="Semua Status"
                    value={draftStatus}
                    onChange={setDraftStatus}
                    options={[
                      { value: "", label: "Semua Status" },
                      { value: "OPEN", label: "Open" },
                      { value: "IN_PROGRESS", label: "In Progress" },
                      { value: "CLOSED", label: "Closed" },
                    ]}
                  />
                </FilterField>
              </FilterFieldsPair>

              <FilterField label="Environment" htmlFor="filter-bugs-environment">
                <FilterSelect
                  id="filter-bugs-environment"
                  icon="environment"
                  ariaLabel="Filter environment"
                  allValue=""
                  placeholder="Semua Environment"
                  value={draftEnv}
                  onChange={setDraftEnv}
                  options={[
                    { value: "", label: "Semua Environment" },
                    ...ENVIRONMENT_OPTIONS.map((env) => ({ value: env, label: env })),
                  ]}
                />
              </FilterField>

              <FilterField label="Periode Laporan" htmlFor="filter-bugs-month">
                <FilterMonth
                  id="filter-bugs-month"
                  ariaLabel="Filter periode laporan"
                  placeholder="Semua Periode"
                  value={draftMonth}
                  onChange={setDraftMonth}
                />
              </FilterField>
            </FilterModal>

            {/* Tombol lapor bug hanya relevan di tab General Findings */}
            {tab === "GENERAL_FINDING" && (
              <button
                type="button"
                className="btn-radius-10"
                onClick={() => setReportOpen(true)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  height: 40,
                  padding: "0 16px",
                  border: "none",
                  background: YELLOW,
                  color: "#0F172A",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                <Plus size={15} aria-hidden="true" /> Laporkan Bug
              </button>
            )}
          </div>
        </div>

        {/* Tabel (mengisi sisa tinggi card; scroll horizontal di dalam card) */}
        {visibleBugs.length === 0 ? (
          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "3rem 1.5rem",
              textAlign: "center",
              color: "#64748B",
              fontSize: 14,
            }}
          >
            {bugs.length === 0
              ? "Belum ada bug yang tercatat di sistem."
              : tab === "ALL"
                ? "Tidak ada bug yang cocok dengan pencarian / filter."
                : `Belum ada bug pada kategori ${tab === "EXECUTION" ? "Test Run Bugs" : "General Findings"}.`}
          </div>
        ) : (
          <>
            <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
              <table
                className="bugs-table"
                style={{
                  width: "100%",
                  minWidth: 1180,
                  tableLayout: "fixed",
                  borderCollapse: "collapse",
                  fontSize: 14,
                }}
              >
                <colgroup>
                  <col />
                  <col style={{ width: 210 }} />
                  <col style={{ width: 220 }} />
                  <col style={{ width: 150 }} />
                  <col style={{ width: 150 }} />
                  <col style={{ width: 220 }} />
                  <col style={{ width: 64 }} />
                </colgroup>
                <thead>
                  <tr style={{ background: HEAD_BG, borderBottom: `1px solid ${LINE}` }}>
                    <th style={{ ...th, paddingLeft: 22 }}>Bug</th>
                    <th style={th}>Test Run</th>
                    <th style={th}>Module · Environment</th>
                    <th style={th}>Severity</th>
                    <th style={th}>Status</th>
                    <th style={th}>Created</th>
                    <th style={{ ...th, textAlign: "right", paddingRight: 22 }}>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedBugs.map((b) => {
                    const code = entityCode("BUG", b.id);
                    const sev = b.severity ? SEVERITY[b.severity.toUpperCase()] : undefined;
                    const env = b.environment ?? b.run?.environment ?? null;
                    const overdue = isBugOverdue(b.createdAt, b.status, b.severity);
                    // Ikon linked TC: pakai URL eksternal bila ada, jika tidak
                    // arahkan ke halaman test case internal.
                    const tcHref = b.externalLink ?? (b.testCase ? `/test-cases/${b.testCase.id}` : null);
                    return (
                      <tr
                        key={b.id}
                        onClick={() => setDetailBugId(b.id)}
                        style={{ borderBottom: `1px solid ${ROW_DIVIDER}`, cursor: "pointer" }}
                      >
                        {/* Bug: judul (+ ikon linked TC) lalu ID di bawahnya */}
                        <td style={{ ...td, paddingLeft: 22 }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                              <span
                                title={b.title}
                                style={{
                                  fontWeight: 500,
                                  color: "#0F172A",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                  minWidth: 0,
                                }}
                              >
                                {b.title}
                              </span>
                              {tcHref && (
                                <a
                                  href={tcHref}
                                  target={b.externalLink ? "_blank" : undefined}
                                  rel={b.externalLink ? "noreferrer" : undefined}
                                  aria-label="Buka linked test case"
                                  title="Buka linked test case"
                                  onClick={(e) => e.stopPropagation()}
                                  style={{ display: "inline-flex", color: LINK, flexShrink: 0 }}
                                >
                                  <ExternalLink size={14} aria-hidden="true" />
                                </a>
                              )}
                            </div>
                            <span style={{ ...mono, fontSize: 12, color: "#64748B", whiteSpace: "nowrap" }}>{code}</span>
                          </div>
                        </td>

                        {/* Test Run */}
                        <td style={td}>
                          {b.run && b.run.name ? (
                            <Link
                              href={`/test-runs/${b.run.id}`}
                              title={b.run.name}
                              onClick={(e) => e.stopPropagation()}
                              onMouseEnter={(e) => (e.currentTarget.style.color = LINK_HOVER)}
                              onMouseLeave={(e) => (e.currentTarget.style.color = LINK)}
                              style={{
                                display: "block",
                                fontWeight: 500,
                                color: LINK,
                                textDecoration: "none",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {b.run.name}
                            </Link>
                          ) : (
                            <span
                              title="Ad-hoc"
                              style={{
                                display: "block",
                                color: "#64748B",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              Ad-hoc
                            </span>
                          )}
                        </td>

                        {/* Module · Environment */}
                        <td style={td}>
                          <span
                            title={`${moduleNameOf(b)} · ${env ?? "—"}`}
                            style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                          >
                            <span style={{ color: "#334155" }}>{moduleNameOf(b)}</span>
                            <span style={{ color: "#94A3B8" }}> · </span>
                            {env ? (
                              <span style={{ fontWeight: 600, color: envColor(env) }}>{env}</span>
                            ) : (
                              <span style={{ color: "#94A3B8" }}>—</span>
                            )}
                          </span>
                        </td>

                        {/* Severity */}
                        <td style={td}>
                          {sev ? (
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 6,
                                fontSize: 13,
                                fontWeight: 600,
                                color: sev.text,
                                whiteSpace: "nowrap",
                              }}
                            >
                              <Square color={sev.square} />
                              {sev.label}
                            </span>
                          ) : (
                            <span style={{ color: "#94A3B8" }}>—</span>
                          )}
                        </td>

                        {/* Status (buka menu ubah status) */}
                        <td style={td}>
                          <StatusMenu status={b.status} onSelect={(next) => changeStatus(b.id, next)} />
                        </td>

                        {/* Created: avatar + nama + tanggal (+ Overdue di baris yang sama) */}
                        <td style={td}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                            <span
                              aria-hidden="true"
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: "50%",
                                background: "#EEF1F5",
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 11,
                                fontWeight: 600,
                                color: "#334155",
                                flexShrink: 0,
                              }}
                            >
                              {initialsOf(b.createdBy?.name)}
                            </span>
                            <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                              <span
                                title={b.createdBy?.name ?? undefined}
                                style={{
                                  fontSize: 13,
                                  fontWeight: 500,
                                  color: "#0F172A",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {b.createdBy?.name ?? "—"}
                              </span>
                              <span
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 3,
                                  fontSize: 12,
                                  color: "#64748B",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {formatDate(b.createdAt)}
                                {overdue && (
                                  <>
                                    <span aria-hidden="true" style={{ color: "#CBD5E1" }}>
                                      {" "}·{" "}
                                    </span>
                                    <span
                                      title={`Overdue — melewati SLA ${bugSlaDays(b.severity)} hari`}
                                      style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: 3,
                                        fontSize: 11,
                                        fontWeight: 600,
                                        color: "#B91C1C",
                                      }}
                                    >
                                      <Clock size={10} aria-hidden="true" />
                                      Overdue
                                    </span>
                                  </>
                                )}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Aksi (kebab) */}
                        <td style={{ ...td, paddingRight: 22 }} onClick={(e) => e.stopPropagation()}>
                          <div style={{ display: "flex", justifyContent: "flex-end" }}>
                            <RowActionsMenu
                              actions={rowActionsFor(b)}
                              ariaLabel={`Aksi untuk ${code}`}
                              iconSize={18}
                              iconColor="#475569"
                              triggerClassName="btn-radius-8"
                              triggerStyle={{ width: 36, height: 36, padding: 0 }}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination — selalu di dasar card, angka polos tanpa box */}
            <nav
              aria-label="Navigasi halaman Bugs"
              style={{
                display: "flex",
                justifyContent: "flex-end",
                alignItems: "center",
                gap: 4,
                padding: "12px 22px",
                background: PAGER_BG,
                flexShrink: 0,
              }}
            >
              <button
                type="button"
                aria-label="Halaman sebelumnya"
                disabled={currentPage <= 1}
                onClick={() => setPage(currentPage - 1)}
                style={{ ...pagerBtn, cursor: currentPage <= 1 ? "default" : "pointer" }}
              >
                <ChevronLeft size={16} color={currentPage <= 1 ? "#CBD5E1" : "#334155"} aria-hidden="true" />
              </button>

              {pageItems.map((p, i) =>
                typeof p === "number" ? (
                  <button
                    key={i}
                    type="button"
                    aria-current={p === currentPage ? "page" : undefined}
                    aria-label={`Halaman ${p}`}
                    onClick={() => setPage(p)}
                    style={{ ...pagerBtn, cursor: "pointer" }}
                  >
                    <span
                      style={{
                        ...mono,
                        fontSize: 14,
                        fontWeight: p === currentPage ? 600 : 500,
                        color: p === currentPage ? "#0F172A" : "#64748B",
                        padding: "4px 2px",
                        borderBottom: p === currentPage ? `2px solid ${YELLOW}` : "2px solid transparent",
                      }}
                    >
                      {p}
                    </span>
                  </button>
                ) : (
                  <span key={i} aria-hidden="true" style={{ ...pagerBtn, ...mono, fontSize: 14, color: "#94A3B8" }}>
                    …
                  </span>
                )
              )}

              <button
                type="button"
                aria-label="Halaman berikutnya"
                disabled={currentPage >= totalPages}
                onClick={() => setPage(currentPage + 1)}
                style={{ ...pagerBtn, cursor: currentPage >= totalPages ? "default" : "pointer" }}
              >
                <ChevronRight size={16} color={currentPage >= totalPages ? "#CBD5E1" : "#334155"} aria-hidden="true" />
              </button>
            </nav>
          </>
        )}
      </div>

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
        <BugDetailModal bugId={detailBugId} onClose={() => setDetailBugId(null)} onUpdated={patchBug} />
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
