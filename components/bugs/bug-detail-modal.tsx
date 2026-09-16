"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ExternalLink, Trash2, X } from "lucide-react";
import { deleteBug, updateBugStatus } from "@/lib/actions/automation-bugs";
import { AttachmentsPanel } from "@/components/attachments/attachments-panel";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/feedback";
import { entityCode } from "@/lib/format";
import type { BugDetailPayload, BugRow, BugStatus } from "@/types/api";

const STATUS_OPTIONS: { value: BugStatus; label: string }[] = [
  { value: "OPEN", label: "Open" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "CLOSED", label: "Closed" },
];

/** Warna severity disamakan dengan tabel Bugs supaya konsisten lintas halaman. */
const severityStyle: Record<string, { bg: string; color: string }> = {
  CRITICAL: { bg: "var(--danger-bg)", color: "var(--danger)" },
  HIGH: { bg: "var(--warning-bg)", color: "#B45309" },
  MEDIUM: { bg: "var(--info-bg)", color: "#1D4ED8" },
  LOW: { bg: "var(--surface-muted)", color: "var(--text-secondary)" },
};

const labelStyle: React.CSSProperties = {
  fontSize: "0.6875rem",
  fontWeight: 700,
  color: "#94A3B8",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  marginBottom: "0.4rem",
};

const fieldLabelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.6875rem",
  fontWeight: 600,
  color: "#94A3B8",
  marginBottom: "0.2rem",
};

/**
 * Modal detail bug: seluruh siklus hidup bug dalam satu tempat (ID, judul,
 * severity, status, rujukan TC, pelapor, deskripsi/actual result, evidence).
 * Mengambil datanya sendiri dari /api/bugs/[id] karena payload daftar run
 * tidak memuat deskripsi + evidence bug.
 */
export function BugDetailModal({
  bugId,
  onClose,
  onStatusChange,
  onDeleted,
}: {
  bugId: string;
  onClose: () => void;
  /** Status bug berubah — parent memakai ini untuk patch daftar lokal. */
  onStatusChange?: (bugId: string, status: BugStatus) => void;
  /** Bug dihapus — parent membuang barisnya dari daftar lokal. */
  onDeleted?: (bugId: string) => void;
}) {
  const [bug, setBug] = useState<BugRow | null>(null);
  const [canAttach, setCanAttach] = useState(false);
  const [canUpdateStatus, setCanUpdateStatus] = useState(false);
  const [canDelete, setCanDelete] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusPending, setStatusPending] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const busy = statusPending || deleting;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/bugs/${bugId}`, { cache: "no-store" });
        if (!res.ok) {
          throw new Error(res.status === 404 ? "Bug tidak ditemukan." : "Gagal memuat detail bug.");
        }
        const data = (await res.json()) as BugDetailPayload;
        if (cancelled) return;
        setBug(data.bug);
        setCanAttach(data.canAttach);
        setCanUpdateStatus(data.canUpdateStatus);
        setCanDelete(data.canDelete);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Gagal memuat detail bug.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bugId]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, busy]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const changeStatus = async (status: BugStatus) => {
    if (!bug || busy || !canUpdateStatus || status === bug.status) return;
    setError(null);
    setStatusPending(true);
    const res = await updateBugStatus(bug.id, status);
    setStatusPending(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setBug((prev) => (prev ? { ...prev, status } : prev));
    onStatusChange?.(bug.id, status);
  };

  const remove = async () => {
    if (!bug || deleting || !canDelete) return;
    setError(null);
    setDeleting(true);
    const res = await deleteBug(bug.id);
    setDeleting(false);
    if (res.error) {
      setError(res.error);
      setConfirmingDelete(false);
      return;
    }
    onDeleted?.(bug.id);
    onClose();
  };

  const sev = bug?.severity ? (severityStyle[bug.severity] ?? severityStyle.LOW) : null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Detail Bug"
      onClick={() => {
        if (!busy) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 300,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        background: "rgba(15, 23, 42, 0.4)",
        backdropFilter: "blur(4px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 672,
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          background: "#fff",
          borderRadius: 16,
          border: "1px solid #F1F5F9",
          boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
          overflow: "hidden",
          animation: "modalIn 0.18s ease-out",
        }}
      >
        {/* Header */}
        <div style={{ flexShrink: 0, padding: "1.25rem 1.5rem 0.75rem" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.75rem" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                <span
                  style={{
                    background: "#FFE4E6",
                    color: "#BE123C",
                    fontWeight: 700,
                    padding: "0.125rem 0.625rem",
                    borderRadius: 6,
                    fontSize: "0.75rem",
                    fontFamily: "var(--font-mono, monospace)",
                    flexShrink: 0,
                  }}
                >
                  {entityCode("BUG", bugId)}
                </span>
                {bug && (
                  <h2
                    style={{
                      margin: 0,
                      fontSize: "1rem",
                      fontWeight: 700,
                      color: "#1E293B",
                      lineHeight: 1.4,
                      minWidth: 0,
                    }}
                  >
                    {bug.title}
                  </h2>
                )}
              </div>
            </div>
            <button
              type="button"
              aria-label="Tutup"
              onClick={onClose}
              disabled={busy}
              style={{
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 4,
                border: "none",
                borderRadius: 8,
                background: "transparent",
                color: "#94A3B8",
                cursor: busy ? "not-allowed" : "pointer",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#475569")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#94A3B8")}
            >
              <X size={18} />
            </button>
          </div>

          {/* Sub-header: rujukan TC + link eksternal kalau ada */}
          {bug && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap", marginTop: "0.5rem" }}>
              {bug.testCase ? (
                <Link
                  href={`/test-cases/${bug.testCase.id}`}
                  style={{ fontSize: "0.75rem", fontWeight: 500, color: "#2563EB", textDecoration: "none" }}
                  onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
                  onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
                >
                  TC Ref: {bug.testCase.tcId}
                </Link>
              ) : (
                <span
                  style={{
                    display: "inline-block",
                    padding: "0.125rem 0.5rem",
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
              {bug.suite && (
                <span style={{ fontSize: "0.75rem", color: "#64748B" }}>
                  Suite: <strong style={{ color: "#334155", fontWeight: 600 }}>{bug.suite.name}</strong>
                </span>
              )}
              {bug.project && (
                <span style={{ fontSize: "0.75rem", color: "#64748B" }}>
                  Project: <strong style={{ color: "#334155", fontWeight: 600 }}>{bug.project.name}</strong>
                </span>
              )}
              {bug.externalLink && (
                <a
                  href={bug.externalLink}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.25rem",
                    fontSize: "0.75rem",
                    fontWeight: 500,
                    color: "#2563EB",
                    textDecoration: "none",
                  }}
                >
                  Link eksternal <ExternalLink size={12} />
                </a>
              )}
            </div>
          )}
        </div>

        {/* Body (scrollable) */}
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 1.5rem 1.25rem" }}>
          {loading ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", padding: "3rem 0", color: "#64748B", fontSize: "0.8rem" }}>
              <Spinner size={16} /> Memuat detail bug...
            </div>
          ) : !bug ? (
            <div style={{ padding: "2rem 0", textAlign: "center", fontSize: "0.8rem", color: "#B91C1C" }}>
              {error ?? "Bug tidak ditemukan."}
            </div>
          ) : (
            <>
              {/* Metadata */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                  gap: "0.75rem",
                  padding: "0.75rem",
                  background: "#F8FAFC",
                  borderRadius: 12,
                  border: "1px solid #F1F5F9",
                  margin: "1rem 0",
                  fontSize: "0.75rem",
                }}
              >
                <div>
                  <span style={fieldLabelStyle}>Severity</span>
                  {sev ? (
                    <span
                      style={{
                        display: "inline-block",
                        padding: "0.1rem 0.5rem",
                        borderRadius: 999,
                        fontSize: "0.7rem",
                        fontWeight: 700,
                        background: sev.bg,
                        color: sev.color,
                      }}
                    >
                      {bug.severity}
                    </span>
                  ) : (
                    <span style={{ color: "#9CA3AF" }}>—</span>
                  )}
                </div>
                <div>
                  <label htmlFor="bug-detail-status" style={fieldLabelStyle}>
                    Status
                  </label>
                  <Select
                    id="bug-detail-status"
                    size="sm"
                    value={bug.status}
                    disabled={busy || !canUpdateStatus}
                    onChange={(e) => void changeStatus(e.target.value as BugStatus)}
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <span style={fieldLabelStyle}>Created By</span>
                  <span style={{ fontWeight: 600, color: "#334155" }}>{bug.createdBy?.name ?? "—"}</span>
                </div>
                <div>
                  <span style={fieldLabelStyle}>Created Date</span>
                  <span style={{ fontWeight: 500, color: "#334155" }}>
                    {new Date(bug.createdAt).toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </div>
              </div>

              {/* Deskripsi & hasil aktual */}
              <div style={{ marginBottom: "1.25rem" }}>
                <div style={labelStyle}>Deskripsi &amp; Hasil Aktual</div>
                <div
                  style={{
                    padding: "0.75rem",
                    background: "rgba(248, 250, 252, 0.8)",
                    borderRadius: 12,
                    border: "1px solid #E2E8F0",
                    fontSize: "0.75rem",
                    color: "#334155",
                    lineHeight: 1.625,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {bug.description?.trim() ? bug.description : "Tidak ada deskripsi."}
                </div>
              </div>

              {/* Evidence */}
              <div>
                <div style={labelStyle}>Evidence (Lampiran)</div>
                {bug.attachments.length === 0 && !canAttach ? (
                  <div style={{ fontSize: "0.75rem", color: "#94A3B8", fontStyle: "italic" }}>
                    Tidak ada bukti terlampir
                  </div>
                ) : (
                  <AttachmentsPanel
                    owner={{ bugId: bug.id }}
                    attachments={bug.attachments}
                    canEdit={canAttach}
                    onChange={(items) => setBug((prev) => (prev ? { ...prev, attachments: items } : prev))}
                    compact
                  />
                )}
              </div>

              {error && (
                <div style={{ marginTop: "0.75rem", fontSize: "0.75rem", color: "#B91C1C" }}>{error}</div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.75rem",
            padding: "1rem 1.5rem",
            borderTop: "1px solid #F1F5F9",
            background: "rgba(248, 250, 252, 0.5)",
          }}
        >
          {bug && canDelete ? (
            confirmingDelete ? (
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                <span style={{ fontSize: "0.75rem", color: "#64748B" }}>Hapus bug ini?</span>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  disabled={deleting}
                  style={{
                    padding: "0.375rem 0.75rem",
                    border: "1px solid #E2E8F0",
                    borderRadius: 8,
                    background: "#fff",
                    color: "#475569",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    cursor: deleting ? "not-allowed" : "pointer",
                  }}
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => void remove()}
                  disabled={deleting}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.35rem",
                    padding: "0.375rem 0.75rem",
                    border: "none",
                    borderRadius: 8,
                    background: "#E11D48",
                    color: "#fff",
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    cursor: deleting ? "wait" : "pointer",
                  }}
                >
                  <Trash2 size={13} /> {deleting ? "Menghapus..." : "Ya, Hapus"}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                disabled={busy}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.375rem",
                  padding: "0.375rem 0.75rem",
                  border: "none",
                  borderRadius: 8,
                  background: "transparent",
                  color: "#E11D48",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  cursor: busy ? "not-allowed" : "pointer",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#FFF1F2")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <Trash2 size={13} /> Hapus Bug
              </button>
            )
          ) : (
            <span />
          )}

          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            style={{
              padding: "0.5rem 1rem",
              border: "none",
              borderRadius: 8,
              background: "#E2E8F0",
              color: "#1E293B",
              fontSize: "0.75rem",
              fontWeight: 700,
              cursor: busy ? "not-allowed" : "pointer",
              transition: "background-color 0.15s ease",
            }}
            onMouseEnter={(e) => {
              if (!busy) e.currentTarget.style.background = "#CBD5E1";
            }}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#E2E8F0")}
          >
            Tutup
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
