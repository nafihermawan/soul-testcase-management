"use client";

import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { ExternalLink, Plus, Search, Trash2 } from "lucide-react";
import { deleteBug, updateBugStatus } from "@/lib/actions/automation-bugs";
import { ConfirmDialog, Toast, useToast } from "@/components/ui/feedback";
import { BugDetailModal } from "@/components/bugs/bug-detail-modal";
import { ReportGeneralBugModal } from "@/components/bugs/report-general-bug-modal";
import { HistoryPagination } from "@/components/test-runs/history-pagination";
import { entityCode, runCodeOf } from "@/lib/format";
import type { AttachmentItem, BugSourceType, BugStatus } from "@/types/api";

export type BugRow = {
  id: string;
  title: string;
  description: string | null;
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
  severity: string | null;
  externalLink: string | null;
  createdAt: string;
  testCase: { id: string; tcId: string; title: string } | null;
  /** Test Run tempat bug ditemukan; null untuk temuan ad-hoc. */
  run?: { id: string; name: string; sprint: string | null; createdAt: string } | null;
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
 * Klasifikasi sumber bug. Field `sourceType` dari API dipakai kalau ada, tapi
 * selalu ada fallback ke relasi `testCase` — aturannya memang diturunkan dari
 * situ, jadi bug tidak akan salah kategori hanya karena payload-nya belum
 * memuat field baru (mis. data basi dari cache klien).
 */
const sourceTypeOf = (b: BugRow): BugSourceType =>
  b.sourceType ?? (b.testCase ? "EXECUTION" : "GENERAL_FINDING");

const statusStyle: Record<BugRow["status"], { bg: string; color: string }> = {
  OPEN: { bg: "var(--danger-bg)", color: "var(--danger)" },
  IN_PROGRESS: { bg: "var(--warning-bg)", color: "#B45309" },
  RESOLVED: { bg: "var(--success-bg)", color: "var(--success)" },
  CLOSED: { bg: "var(--surface-muted)", color: "var(--text-secondary)" },
};

const severityStyle: Record<string, { bg: string; color: string }> = {
  CRITICAL: { bg: "var(--danger-bg)", color: "var(--danger)" },
  HIGH: { bg: "var(--warning-bg)", color: "#B45309" },
  MEDIUM: { bg: "var(--info-bg)", color: "#1D4ED8" },
  LOW: { bg: "var(--surface-muted)", color: "var(--text-secondary)" },
};

export function BugsPageClient({ bugs }: { bugs: BugRow[] }) {
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
  const [sevFilter, setSevFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  const q = query.trim().toLowerCase();
  const visibleBugs = localBugs.filter((b) => {
    if (tab !== "ALL" && sourceTypeOf(b) !== tab) return false;
    if (sevFilter && b.severity !== sevFilter) return false;
    if (statusFilter && b.status !== statusFilter) return false;
    if (!q) return true;
    const hay = `${b.title} ${b.description ?? ""} ${b.testCase?.tcId ?? ""} ${b.testCase?.title ?? ""} ${b.createdBy?.name ?? ""}`.toLowerCase();
    return hay.includes(q);
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
  }, [tab, query, sevFilter, statusFilter]);

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

  const selectStyle: CSSProperties = {
    padding: "0.4rem 0.7rem",
    borderRadius: 8,
    border: "1px solid #D1D5DB",
    background: "#fff",
    fontSize: "0.8rem",
    color: "#374151",
    cursor: "pointer",
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
              fontSize: 22,
              fontWeight: 700,
              color: "#0F172A",
              margin: 0,
              lineHeight: 1.2,
            }}
          >
            Bugs Tracker
          </h1>
          <p
            style={{
              fontSize: 13,
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
              padding: "0.4rem 0.7rem",
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
          <select value={sevFilter} onChange={(e) => setSevFilter(e.target.value)} style={selectStyle}>
            <option value="">All Severity</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={selectStyle}>
            <option value="">All Status</option>
            <option value="OPEN">Open</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="RESOLVED">Resolved</option>
            <option value="CLOSED">Closed</option>
          </select>
          {/* Tombol lapor bug hanya relevan di tab General Findings */}
          {tab === "GENERAL_FINDING" && (
            <button
              type="button"
              onClick={() => setReportOpen(true)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                height: 36,
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
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
              <thead>
                <tr style={{ color: "var(--text-muted)", textAlign: "left", background: "#F8FAFC", borderBottom: "1px solid #E5E7EB" }}>
                  <th style={{ padding: "0.6rem 1.25rem", fontWeight: 600 }}>ID</th>
                  <th style={{ padding: "0.6rem 0.5rem", fontWeight: 600 }}>Title & Linked TC</th>
                  <th style={{ padding: "0.6rem 0.5rem", fontWeight: 600 }}>Test Run</th>
                  <th style={{ padding: "0.6rem 0.5rem", fontWeight: 600 }}>Severity</th>
                  <th style={{ padding: "0.6rem 0.5rem", fontWeight: 600 }}>Status</th>
                  <th style={{ padding: "0.6rem 0.5rem", fontWeight: 600 }}>Created By</th>
                  <th style={{ padding: "0.6rem 0.5rem", fontWeight: 600 }}>Created Date</th>
                  <th style={{ padding: "0.6rem 1.25rem", fontWeight: 600, textAlign: "right" }}></th>
                </tr>
              </thead>
              <tbody>
                {pagedBugs.map((b) => {
                  const st = statusStyle[b.status];
                  const sev = b.severity ? (severityStyle[b.severity] ?? severityStyle.LOW) : null;
                  return (
                    <tr
                      key={b.id}
                      onClick={() => setDetailBugId(b.id)}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#F8FAFC")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                      style={{ borderTop: "1px solid var(--border)", cursor: "pointer" }}
                    >
                      <td style={{ padding: "0.6rem 1.25rem" }}>
                        <span
                          style={{
                            fontFamily: "var(--font-mono, monospace)",
                            color: "#1E293B",
                            fontWeight: 700,
                            fontSize: "0.75rem",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {entityCode("BUG", b.id)}
                        </span>
                      </td>
                      <td style={{ padding: "0.6rem 0.5rem" }}>
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "flex-start",
                            gap: "0.3rem",
                            minWidth: 0,
                          }}
                        >
                          {/* 1. Judul + link eksternal */}
                          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", minWidth: 0 }}>
                            <span style={{ fontWeight: 600, fontSize: "0.85rem", color: "#0F172A", lineHeight: 1.4 }}>
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

                          {/* 2. Badge kategori: rujukan TC (interaktif) atau temuan ad-hoc */}
                          {sourceTypeOf(b) === "EXECUTION" && b.testCase ? (
                            <a
                              href={`/test-cases/${b.testCase.id}`}
                              onClick={(e) => e.stopPropagation()}
                              title={b.testCase.title}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "0.3rem",
                                padding: "0.1rem 0.5rem",
                                background: "#EFF6FF",
                                color: "#1D4ED8",
                                border: "1px solid #BFDBFE",
                                borderRadius: 4,
                                fontFamily: "var(--font-mono, monospace)",
                                fontSize: "0.6875rem",
                                fontWeight: 600,
                                textDecoration: "none",
                              }}
                            >
                              TC Ref: {b.testCase.tcId}
                            </a>
                          ) : (
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                padding: "0.1rem 0.5rem",
                                background: "#FAF5FF",
                                color: "#7E22CE",
                                border: "1px solid #E9D5FF",
                                borderRadius: 4,
                                fontSize: "0.625rem",
                                fontWeight: 700,
                              }}
                            >
                              Ad-hoc / General
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: "0.6rem 0.5rem" }}>
                        {b.run ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: "0.1rem", minWidth: 0 }}>
                            <Link
                              href={`/test-runs/${b.run.id}`}
                              onClick={(e) => e.stopPropagation()}
                              title={b.run.name}
                              style={{
                                fontSize: "0.78rem",
                                fontWeight: 600,
                                color: "#2563EB",
                                textDecoration: "none",
                                maxWidth: 180,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                              onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
                              onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
                            >
                              {b.run.name}
                            </Link>
                            <span
                              style={{
                                fontFamily: "var(--font-mono, monospace)",
                                fontSize: "0.68rem",
                                color: "#94A3B8",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {runCodeOf({ id: b.run.id, sprint: b.run.sprint, createdAt: b.run.createdAt })}
                            </span>
                          </div>
                        ) : (
                          <span style={{ color: "#94A3B8" }}>-</span>
                        )}
                      </td>
                      <td style={{ padding: "0.6rem 0.5rem" }}>
                        {sev ? (
                          <span style={{ display: "inline-block", padding: "0.1rem 0.5rem", borderRadius: 999, fontSize: "0.72rem", fontWeight: 700, background: sev.bg, color: sev.color }}>
                            {b.severity}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td style={{ padding: "0.6rem 0.5rem" }}>
                        <select
                          value={b.status}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => changeStatus(b.id, e.target.value as BugRow["status"])}
                          style={{ padding: "0.25rem 0.5rem", borderRadius: 6, border: "1px solid var(--border-strong)", fontSize: "0.78rem", fontWeight: 600, background: st.bg, color: st.color, cursor: "pointer" }}
                        >
                          <option value="OPEN">Open</option>
                          <option value="IN_PROGRESS">In Progress</option>
                          <option value="RESOLVED">Resolved</option>
                          <option value="CLOSED">Closed</option>
                        </select>
                      </td>
                      <td style={{ padding: "0.6rem 0.5rem", color: "var(--text-secondary)" }}>
                        {b.createdBy?.name ?? "—"}
                      </td>
                      <td style={{ padding: "0.6rem 0.5rem", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                        {new Date(b.createdAt).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}
                      </td>
                      <td style={{ padding: "0.6rem 1.25rem", textAlign: "right" }}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget(b);
                          }}
                          title="Hapus bug"
                          style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 8, border: "none", background: "var(--danger-bg)", color: "var(--danger)", cursor: "pointer" }}
                        >
                          <Trash2 size={14} />
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
          onStatusChange={(bugId: string, status: BugStatus) => patchBug(bugId, { status })}
          onDeleted={(bugId: string) => setLocalBugs((prev) => prev.filter((b) => b.id !== bugId))}
        />
      )}

      {/* Modal lapor bug ad-hoc (General Findings) */}
      {reportOpen && (
        <ReportGeneralBugModal
          onClose={() => setReportOpen(false)}
          onCreated={(bug) => {
            setLocalBugs((prev) => [bug, ...prev]);
            showToast("Bug berhasil dilaporkan.", "success");
          }}
        />
      )}

      <Toast toast={toast} onDismiss={dismissToast} />
    </>
  );
}
