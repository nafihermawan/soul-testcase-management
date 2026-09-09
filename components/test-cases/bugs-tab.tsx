"use client";

import { useState } from "react";
import { Bug, ExternalLink, Trash2 } from "lucide-react";
import { createBug, deleteBug, updateBugStatus } from "@/lib/actions/automation-bugs";
import { useRefresh } from "@/lib/client/refresh-context";
import { ConfirmDialog, Spinner, Toast, useToast } from "@/components/ui/feedback";

export type BugItem = {
  id: string;
  title: string;
  description: string | null;
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
  severity: string | null;
  externalLink: string | null;
  createdAt: string;
  createdBy: { name: string | null } | null;
};

const statusStyle: Record<BugItem["status"], { bg: string; color: string }> = {
  OPEN: { bg: "var(--danger-bg)", color: "var(--danger)" },
  IN_PROGRESS: { bg: "var(--warning-bg)", color: "#B45309" },
  RESOLVED: { bg: "var(--success-bg)", color: "var(--success)" },
  CLOSED: { bg: "var(--surface-muted)", color: "var(--text-secondary)" },
};

export function BugsTab({ testCaseId, bugs }: { testCaseId: string; bugs: BugItem[] }) {
  const refresh = useRefresh();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState("");
  const [externalLink, setExternalLink] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BugItem | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const { toast, showToast, dismissToast } = useToast();

  const saveBug = async () => {
    setPending(true);
    setError(null);
    const res = await createBug({ title, description, severity, externalLink, testCaseId });
    setPending(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setTitle("");
    setDescription("");
    setSeverity("");
    setExternalLink("");
    setCreating(false);
    showToast("Bug berhasil dibuat.", "success");
    refresh();
  };

  const changeStatus = async (bugId: string, status: BugItem["status"]) => {
    await updateBugStatus(bugId, status);
    refresh();
  };

  const removeBug = async (bug: BugItem) => {
    setDeletePending(true);
    await deleteBug(bug.id);
    setDeletePending(false);
    setDeleteTarget(null);
    showToast("Bug dihapus.", "success");
    refresh();
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", padding: "0.75rem 1.25rem", borderBottom: "1px solid var(--border)" }}>
        {!creating && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", padding: "0.45rem 1rem", borderRadius: 8, border: "none", background: "#2563EB", color: "#fff", fontWeight: 600, fontSize: "0.84rem", cursor: "pointer" }}
          >
            <Bug size={14} /> Buat Bug
          </button>
        )}
      </div>

      {creating && (
        <div style={{ margin: "0 1.25rem 1rem", padding: "1rem", background: "#F8FAFC", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", display: "flex", flexDirection: "column", gap: "0.7rem" }}>
          <div>
            <label style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)" }}>Judul Bug *</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="cth: Login gagal saat koneksi lambat"
              style={{ width: "100%", marginTop: "0.25rem", padding: "0.5rem 0.75rem", border: "1px solid var(--border-strong)", borderRadius: 8, fontSize: "0.85rem" }} />
          </div>
          <div>
            <label style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)" }}>Deskripsi</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Langkah reproduksi, dampak, dll. Gunakan @TC-ID untuk me-link test case."
              style={{ width: "100%", marginTop: "0.25rem", padding: "0.5rem 0.75rem", border: "1px solid var(--border-strong)", borderRadius: 8, fontSize: "0.85rem" }} />
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
              Tip: tulis <span style={{ fontFamily: "var(--font-mono)" }}>@TC-ID</span> di deskripsi untuk otomatis me-link bug ke test case tersebut.
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.7rem" }}>
            <div>
              <label style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)" }}>Severity</label>
              <select value={severity} onChange={(e) => setSeverity(e.target.value)} style={{ width: "100%", marginTop: "0.25rem", padding: "0.5rem 0.75rem", border: "1px solid var(--border-strong)", borderRadius: 8, fontSize: "0.85rem", background: "#fff" }}>
                <option value="">—</option>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)" }}>External Link</label>
              <input value={externalLink} onChange={(e) => setExternalLink(e.target.value)} placeholder="https://jira/... atau issue"
                style={{ width: "100%", marginTop: "0.25rem", padding: "0.5rem 0.75rem", border: "1px solid var(--border-strong)", borderRadius: 8, fontSize: "0.85rem" }} />
            </div>
          </div>

          {error && <div style={{ fontSize: "0.82rem", color: "var(--danger)" }}>{error}</div>}

          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
            <button type="button" onClick={() => { setCreating(false); setError(null); }}
              style={{ padding: "0.45rem 1rem", borderRadius: 8, border: "1px solid var(--border-strong)", background: "#fff", color: "var(--text-secondary)", fontWeight: 600, fontSize: "0.84rem", cursor: "pointer" }}>
              Batal
            </button>
            <button type="button" onClick={saveBug} disabled={pending}
              style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", padding: "0.45rem 1rem", borderRadius: 8, border: "none", background: "#FFB622", color: "#1F2937", fontWeight: 700, fontSize: "0.84rem", cursor: pending ? "not-allowed" : "pointer" }}>
              {pending ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                  <Spinner size={13} /> Menyimpan...
                </span>
              ) : (
                "Simpan"
              )}
            </button>
          </div>
        </div>
      )}

      {bugs.length === 0 && !creating ? (
        <p style={{ padding: "1.5rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.9rem" }}>
          Belum ada bug terhubung ke test case ini.
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
            <thead>
              <tr style={{ color: "var(--text-muted)", textAlign: "left", borderBottom: "1px solid var(--border)" }}>
                <th style={{ padding: "0.6rem 1.25rem", fontWeight: 600 }}>Judul</th>
                <th style={{ padding: "0.6rem 0.5rem", fontWeight: 600 }}>Severity</th>
                <th style={{ padding: "0.6rem 0.5rem", fontWeight: 600 }}>Status</th>
                <th style={{ padding: "0.6rem 0.5rem", fontWeight: 600 }}>Link</th>
                <th style={{ padding: "0.6rem 0.5rem", fontWeight: 600 }}>Dibuat</th>
                <th style={{ padding: "0.6rem 1.25rem", fontWeight: 600 }}></th>
              </tr>
            </thead>
            <tbody>
              {bugs.map((bug) => {
                const st = statusStyle[bug.status];
                return (
                  <tr key={bug.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "0.6rem 1.25rem" }}>
                      <div style={{ fontWeight: 600 }}>{bug.title}</div>
                      {bug.description && (
                        <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{bug.description}</div>
                      )}
                    </td>
                    <td style={{ padding: "0.6rem 0.5rem", color: "var(--text-secondary)" }}>{bug.severity ?? "—"}</td>
                    <td style={{ padding: "0.6rem 0.5rem" }}>
                      <select
                        value={bug.status}
                        onChange={(e) => changeStatus(bug.id, e.target.value as BugItem["status"])}
                        style={{ padding: "0.25rem 0.5rem", borderRadius: 6, border: "1px solid var(--border-strong)", fontSize: "0.78rem", fontWeight: 600, background: st.bg, color: st.color, cursor: "pointer" }}
                      >
                        <option value="OPEN">Open</option>
                        <option value="IN_PROGRESS">In Progress</option>
                        <option value="RESOLVED">Resolved</option>
                        <option value="CLOSED">Closed</option>
                      </select>
                    </td>
                    <td style={{ padding: "0.6rem 0.5rem" }}>
                      {bug.externalLink ? (
                        <a href={bug.externalLink} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", color: "var(--brand-600)", textDecoration: "none" }}>
                          <ExternalLink size={13} /> Buka
                        </a>
                      ) : "—"}
                    </td>
                    <td style={{ padding: "0.6rem 0.5rem", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                      {new Date(bug.createdAt).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}
                    </td>
                    <td style={{ padding: "0.6rem 1.25rem", textAlign: "right" }}>
                      <button type="button" onClick={() => setDeleteTarget(bug)} title="Hapus bug"
                        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 8, border: "none", background: "var(--danger-bg)", color: "var(--danger)", cursor: "pointer" }}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Confirm hapus bug */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Hapus Bug?"
        message={
          <>
            Bug <strong>{deleteTarget?.title}</strong> akan dihapus permanen.
          </>
        }
        pending={deletePending}
        onConfirm={() => deleteTarget && void removeBug(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Toast */}
      <Toast toast={toast} onDismiss={dismissToast} />
    </div>
  );
}
