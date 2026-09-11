"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { ExternalLink, Paperclip, Search, Trash2 } from "lucide-react";
import { deleteBug, updateBugStatus } from "@/lib/actions/automation-bugs";
import { ConfirmDialog, Toast, useToast } from "@/components/ui/feedback";
import { BugAttachmentsModal } from "@/components/bugs/bug-attachments-modal";
import { entityCode } from "@/lib/format";
import type { AttachmentItem } from "@/types/api";

export type BugRow = {
  id: string;
  title: string;
  description: string | null;
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
  severity: string | null;
  externalLink: string | null;
  createdAt: string;
  testCase: { id: string; tcId: string; title: string } | null;
  createdBy: { name: string | null } | null;
  attachments?: AttachmentItem[];
};

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

export function BugsPageClient({
  bugs,
  canAttach = false,
  reload,
}: {
  bugs: BugRow[];
  /** Upload/hapus attachment butuh role QA. */
  canAttach?: boolean;
  reload?: () => void;
}) {
  const [deleteTarget, setDeleteTarget] = useState<BugRow | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [evidenceBug, setEvidenceBug] = useState<BugRow | null>(null);
  const { toast, showToast, dismissToast } = useToast();
  // Cermin lokal daftar bug: upload/hapus evidence cukup memperbarui barisnya
  // sendiri (tanpa refetch halaman, supaya modal & posisi scroll tidak hilang).
  const [localBugs, setLocalBugs] = useState<BugRow[]>(bugs);
  useEffect(() => {
    setLocalBugs(bugs);
  }, [bugs]);

  /** Patch daftar attachment satu bug di state lokal. */
  const patchBugAttachments = (bugId: string, list: AttachmentItem[]) => {
    setLocalBugs((prev) => prev.map((b) => (b.id === bugId ? { ...b, attachments: list } : b)));
    setEvidenceBug((prev) => (prev && prev.id === bugId ? { ...prev, attachments: list } : prev));
  };

  // Filter pencarian header banner
  const [query, setQuery] = useState("");
  const [sevFilter, setSevFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  const q = query.trim().toLowerCase();
  const visibleBugs = localBugs.filter((b) => {
    if (sevFilter && b.severity !== sevFilter) return false;
    if (statusFilter && b.status !== statusFilter) return false;
    if (!q) return true;
    const hay = `${b.title} ${b.description ?? ""} ${b.testCase?.tcId ?? ""} ${b.testCase?.title ?? ""} ${b.createdBy?.name ?? ""}`.toLowerCase();
    return hay.includes(q);
  });

  const changeStatus = async (bugId: string, status: BugRow["status"]) => {
    const res = await updateBugStatus(bugId, status);
    if (res?.error) {
      showToast(res.error, "error");
    }
    reload?.();
  };

  const removeBug = async () => {
    if (!deleteTarget) return;
    setDeletePending(true);
    const res = await deleteBug(deleteTarget.id);
    setDeletePending(false);
    setDeleteTarget(null);
    if (res?.error) {
      showToast(res.error, "error");
      return;
    }
    showToast("Bug dihapus.", "success");
    reload?.();
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
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
          flexWrap: "wrap",
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
            Daftar bug yang tercatat dari hasil eksekusi test case. Ubah status untuk melacak penyelesaian.
          </p>
        </div>

        {/* Quick search & filter */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
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
        </div>
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
            : "Tidak ada bug yang cocok dengan pencarian / filter."}
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
                  <th style={{ padding: "0.6rem 0.5rem", fontWeight: 600 }}>Severity</th>
                  <th style={{ padding: "0.6rem 0.5rem", fontWeight: 600 }}>Status</th>
                  <th style={{ padding: "0.6rem 0.5rem", fontWeight: 600 }}>Created By</th>
                  <th style={{ padding: "0.6rem 0.5rem", fontWeight: 600 }}>Created Date</th>
                  <th style={{ padding: "0.6rem 1.25rem", fontWeight: 600, textAlign: "right" }}></th>
                </tr>
              </thead>
              <tbody>
                {visibleBugs.map((b) => {
                  const st = statusStyle[b.status];
                  const sev = b.severity ? (severityStyle[b.severity] ?? severityStyle.LOW) : null;
                  return (
                    <tr key={b.id} style={{ borderTop: "1px solid var(--border)" }}>
                      <td style={{ padding: "0.6rem 1.25rem" }}>
                        <span
                          style={{
                            fontFamily: "var(--font-mono, monospace)",
                            color: "#DC2626",
                            fontWeight: 700,
                            fontSize: "0.75rem",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {entityCode("BUG", b.id)}
                        </span>
                      </td>
                      <td style={{ padding: "0.6rem 0.5rem" }}>
                        <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: "0.4rem" }}>
                          <span>{b.title}</span>
                          {b.externalLink && (
                            <a href={b.externalLink} target="_blank" rel="noreferrer" title={b.externalLink}
                              style={{ display: "inline-flex", alignItems: "center", color: "var(--brand-600)", textDecoration: "none" }}>
                              <ExternalLink size={13} />
                            </a>
                          )}
                        </div>
                        {b.testCase && (
                          <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontFamily: "var(--font-mono, monospace)", marginTop: 2 }}>
                            TC Ref:{" "}
                            <a
                              href={`/test-cases/${b.testCase.id}`}
                              style={{ color: "#2563EB", textDecoration: "none" }}
                            >
                              {b.testCase.tcId}
                            </a>
                          </div>
                        )}
                        {b.description && (
                          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {b.description}
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => setEvidenceBug(b)}
                          title="Screenshot / video evidence"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.25rem",
                            marginTop: 3,
                            padding: "0.1rem 0.45rem",
                            borderRadius: 999,
                            border: "1px solid var(--border-strong)",
                            background: "transparent",
                            color: (b.attachments?.length ?? 0) > 0 ? "var(--brand-600)" : "var(--text-muted)",
                            fontSize: "0.7rem",
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          <Paperclip size={11} /> {b.attachments?.length ?? 0}
                        </button>
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
                          onClick={() => setDeleteTarget(b)}
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

      {/* Modal evidence bug */}
      {evidenceBug && (
        <BugAttachmentsModal
          bugId={evidenceBug.id}
          bugTitle={evidenceBug.title}
          attachments={evidenceBug.attachments ?? []}
          canEdit={canAttach}
          onClose={() => setEvidenceBug(null)}
          onChange={(list) => patchBugAttachments(evidenceBug.id, list)}
        />
      )}

      <Toast toast={toast} onDismiss={dismissToast} />
    </>
  );
}
