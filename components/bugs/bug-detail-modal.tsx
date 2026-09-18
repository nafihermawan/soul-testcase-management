"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ExternalLink, Pencil, Trash2, X } from "lucide-react";
import { deleteBug } from "@/lib/actions/automation-bugs";
import { AttachmentsPanel } from "@/components/attachments/attachments-panel";
import { EditBugModal } from "@/components/bugs/edit-bug-modal";
import { Spinner } from "@/components/ui/feedback";
import { entityCode } from "@/lib/format";
import type { BugDetailPayload, BugEditableFields, BugRow } from "@/types/api";

const labelStyle: React.CSSProperties = {
  fontSize: "0.6875rem",
  fontWeight: 700,
  color: "#94A3B8",
  marginBottom: "0.4rem",
};

/** Paragraf isi (Expected Result & Bug Description) — plain text tanpa box. */
const bodyTextStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "0.75rem",
  color: "#334155",
  lineHeight: 1.625,
  whiteSpace: "pre-wrap",
};

/**
 * Modal detail bug: judul, ID, rujukan TC, expected result dari TC, deskripsi,
 * dan evidence read-only. Mengambil datanya sendiri dari /api/bugs/[id] karena
 * payload daftar run tidak memuat deskripsi + evidence bug.
 */
export function BugDetailModal({
  bugId,
  onClose,
  onDeleted,
  onUpdated,
}: {
  bugId: string;
  onClose: () => void;
  /** Bug dihapus — parent membuang barisnya dari daftar lokal. */
  onDeleted?: (bugId: string) => void;
  /** Field bug berubah lewat Edit Bug — parent memakai ini untuk patch lokal. */
  onUpdated?: (bugId: string, patch: BugEditableFields) => void;
}) {
  const [bug, setBug] = useState<BugRow | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [canAttach, setCanAttach] = useState(false);
  const [canDelete, setCanDelete] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  /** Edit Bug Modal sedang terbuka di atas modal ini. */
  const [editing, setEditing] = useState(false);

  const busy = deleting;

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
        setCanEdit(data.canEdit);
        setCanAttach(data.canAttach);
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
      // Saat Edit modal terbuka, Escape ditangani modal itu — jangan ikut menutup
      // modal detail di belakangnya.
      if (e.key === "Escape" && !busy && !editing) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, busy, editing]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

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

  /** Simpan Edit Bug: patch modal ini + teruskan ke daftar lokal parent. */
  const handleSaved = (patch: BugEditableFields) => {
    setBug((prev) => (prev ? { ...prev, ...patch } : prev));
    onUpdated?.(bugId, patch);
    setEditing(false);
  };

  return createPortal(
    <>
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
                {/* ID bug — plain text hitam, monospace */}
                <span
                  style={{
                    color: "#0F172A",
                    fontWeight: 700,
                    fontSize: "0.75rem",
                    fontFamily: "var(--font-mono, monospace)",
                  }}
                >
                  {entityCode("BUG", bugId)}
                </span>
                {/* Title di baris baru di bawah ID */}
                {bug && (
                  <h2
                    style={{
                      margin: "0.35rem 0 0",
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

            {/* Divider tipis tepat di bawah title — inset di dalam padding header,
                bukan full-bleed ke tepi modal. */}
            <div style={{ borderTop: "1px solid #F1F5F9", marginTop: "0.75rem" }} />

            {/* Sub-header: rujukan TC + link eksternal kalau ada */}
            {bug && (
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap", marginTop: "0.75rem" }}>
                {bug.testCase ? (
                  <span style={{ fontSize: "0.75rem", color: "#64748B" }}>
                    Test Case Ref:{" "}
                    {/* Hanya nilai TC ID yang hyperlink — labelnya netral. */}
                    <Link
                      href={`/test-cases/${bug.testCase.id}`}
                      style={{ color: "#2563EB", fontWeight: 600, textDecoration: "none" }}
                      onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
                      onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
                    >
                      {bug.testCase.tcId}
                    </Link>
                  </span>
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
                {/* Expected Result — diambil live dari Test Case yang dirujuk. */}
                {bug.testCase && (
                  <div style={{ margin: "1rem 0 1.25rem" }}>
                    <div style={labelStyle}>Expected Result</div>
                    {bug.testCase.expectedResult?.trim() ? (
                      <p style={bodyTextStyle}>{bug.testCase.expectedResult}</p>
                    ) : (
                      <p style={{ ...bodyTextStyle, color: "#94A3B8", fontStyle: "italic" }}>
                        Belum ada expected result di test case ini.
                      </p>
                    )}
                  </div>
                )}

                {/* Bug Description — plain text, tanpa container ber-border. */}
                <div style={{ marginBottom: "1.25rem" }}>
                  <div style={labelStyle}>Bug Description</div>
                  <p style={bodyTextStyle}>
                    {bug.description?.trim() ? bug.description : "Tidak ada deskripsi."}
                  </p>
                </div>

                {/* Evidence — read-only di modal ini; ubah/hapus hanya dari Edit Bug. */}
                <div>
                  <div style={labelStyle}>Evidence (Lampiran)</div>
                  <AttachmentsPanel
                    owner={{ bugId: bug.id }}
                    attachments={bug.attachments}
                    canEdit={false}
                    compact
                  />
                </div>

                {error && (
                  <div style={{ marginTop: "0.75rem", fontSize: "0.75rem", color: "#B91C1C" }}>{error}</div>
                )}
              </>
            )}
          </div>

          {/* Divider inset di atas footer — tidak full-bleed ke tepi modal. */}
          <div style={{ flexShrink: 0, borderTop: "1px solid #F1F5F9", margin: "0 1.5rem" }} />

          {/* Footer */}
          <div
            style={{
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "0.75rem",
              padding: "1rem 1.5rem",
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

            {bug && canEdit ? (
              <button
                type="button"
                onClick={() => setEditing(true)}
                disabled={busy}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  padding: "0.5rem 1rem",
                  border: "none",
                  borderRadius: 8,
                  background: "#FBBF24",
                  color: "#0F172A",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  cursor: busy ? "not-allowed" : "pointer",
                  transition: "background-color 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  if (!busy) e.currentTarget.style.background = "#F59E0B";
                }}
                onMouseLeave={(e) => (e.currentTarget.style.background = "#FBBF24")}
              >
                <Pencil size={13} /> Edit
              </button>
            ) : (
              <span />
            )}
          </div>
        </div>
      </div>

      {/* Edit Bug Modal — sibling (bukan anak overlay) supaya klik di dalamnya
          tidak ikut menutup modal detail lewat bubbling. */}
      {editing && bug && (
        <EditBugModal
          bug={bug}
          canAttach={canAttach}
          onClose={() => setEditing(false)}
          onSaved={handleSaved}
          onAttachmentsChange={(items) =>
            setBug((prev) => (prev ? { ...prev, attachments: items } : prev))
          }
        />
      )}
    </>,
    document.body
  );
}
