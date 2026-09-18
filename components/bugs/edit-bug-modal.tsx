"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { updateBug } from "@/lib/actions/automation-bugs";
import { AttachmentsPanel } from "@/components/attachments/attachments-panel";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/feedback";
import { entityCode } from "@/lib/format";
import type { AttachmentItem, BugEditableFields, BugRow } from "@/types/api";

const SEVERITY_OPTIONS = [
  { value: "", label: "— Tidak ada —" },
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "CRITICAL", label: "Critical" },
];

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.6875rem",
  fontWeight: 700,
  color: "#64748B",
  marginBottom: "0.3rem",
};

const fieldStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.5rem 0.75rem",
  border: "1px solid #E2E8F0",
  borderRadius: 8,
  fontSize: "0.78rem",
  color: "#1E293B",
  background: "#fff",
  outline: "none",
  boxSizing: "border-box",
};

/**
 * Form edit bug: field konten (judul, severity, deskripsi) + kelola evidence.
 * Status sengaja tidak di sini — status lewat baris tabel Bugs.
 * Link eksternal juga tidak di sini (nilai lama dipertahankan apa adanya).
 */
export function EditBugModal({
  bug,
  canAttach,
  onClose,
  onSaved,
  onAttachmentsChange,
}: {
  bug: BugRow;
  /** Role QA — kalau false, kelola evidence jadi read-only. */
  canAttach: boolean;
  onClose: () => void;
  /** Dipanggil dengan nilai final setelah simpan sukses, untuk patch lokal. */
  onSaved: (patch: BugEditableFields) => void;
  /** Teruskan daftar evidence terbaru ke parent (update in-place, tanpa refetch). */
  onAttachmentsChange?: (items: AttachmentItem[]) => void;
}) {
  const [title, setTitle] = useState(bug.title);
  const [severity, setSeverity] = useState(bug.severity ?? "");
  const [description, setDescription] = useState(bug.description ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, pending]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const submit = async () => {
    if (pending) return;
    setError(null);
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Judul bug wajib diisi.");
      return;
    }

    const patch: BugEditableFields = {
      title: trimmedTitle,
      description: description.trim() || null,
      severity: severity.trim() || null,
      // Field link eksternal dihapus dari form — nilai lama tetap dibawa supaya
      // tidak terhapus saat menyimpan.
      externalLink: bug.externalLink,
    };

    setPending(true);
    const res = await updateBug({
      bugId: bug.id,
      title: patch.title,
      description: patch.description ?? undefined,
      severity: patch.severity ?? undefined,
      externalLink: patch.externalLink ?? undefined,
    });
    setPending(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    onSaved(patch);
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Edit Bug"
      onClick={() => {
        if (!pending) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        // Di atas Bug Detail Modal (zIndex 300) karena dibuka dari sana.
        zIndex: 320,
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
          maxWidth: 560,
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
        <div style={{ flexShrink: 0, padding: "1.25rem 1.5rem 0" }}>
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: "0.75rem",
            }}
          >
            <div style={{ minWidth: 0 }}>
              {/* ID bug — mono, regular, slate-600 */}
              <span
                style={{
                  color: "#475569",
                  fontWeight: 400,
                  fontSize: "0.75rem",
                  fontFamily: "var(--font-mono, monospace)",
                }}
              >
                {entityCode("BUG", bug.id)}
              </span>
              <h2 style={{ margin: "0.25rem 0 0", fontSize: "1rem", fontWeight: 700, color: "#1E293B" }}>
                Edit Bug
              </h2>
            </div>
            <button
              type="button"
              aria-label="Tutup"
              onClick={onClose}
              disabled={pending}
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
                cursor: pending ? "not-allowed" : "pointer",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#475569")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#94A3B8")}
            >
              <X size={18} />
            </button>
          </div>

          {/* Divider tipis di bawah title — inset mengikuti padding container. */}
          <div style={{ borderTop: "1px solid #F1F5F9", marginTop: "0.75rem" }} />
        </div>

        {/* Body */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: "0.9rem",
            padding: "1rem 1.5rem 1.25rem",
          }}
        >
          <div>
            <label htmlFor="edit-bug-title" style={labelStyle}>
              Judul Bug <span style={{ color: "#EF4444" }}>*</span>
            </label>
            <input
              id="edit-bug-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="mis. Tombol simpan tidak merespon"
              style={fieldStyle}
            />
          </div>

          <div>
            <label htmlFor="edit-bug-severity" style={labelStyle}>
              Severity
            </label>
            <Select
              id="edit-bug-severity"
              value={severity}
              ariaLabel="Severity"
              disabled={pending}
              onChange={(e) => setSeverity(e.target.value)}
            >
              {SEVERITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label htmlFor="edit-bug-description" style={labelStyle}>
              Deskripsi / Hasil Aktual
            </label>
            <textarea
              id="edit-bug-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              placeholder="Apa yang terjadi saat bug ini ditemukan…"
              style={{ ...fieldStyle, resize: "vertical", lineHeight: 1.55 }}
            />
          </div>

          {/* Kelola evidence: hapus yang ada, tambah lewat dropzone/paste. */}
          <div>
            <label style={labelStyle}>Evidence (Lampiran)</label>
            <AttachmentsPanel
              owner={{ bugId: bug.id }}
              attachments={bug.attachments}
              canEdit={canAttach}
              onChange={onAttachmentsChange}
              compact
            />
          </div>

          {error && <div style={{ fontSize: "0.75rem", color: "#B91C1C" }}>{error}</div>}
        </div>

        {/* Divider inset + footer */}
        <div style={{ flexShrink: 0, borderTop: "1px solid #F1F5F9", margin: "0 1.5rem" }} />
        <div
          style={{
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: "0.6rem",
            padding: "1rem 1.5rem",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            style={{
              padding: "0.5rem 1rem",
              border: "1px solid #E2E8F0",
              borderRadius: 8,
              background: "#fff",
              color: "#475569",
              fontSize: "0.75rem",
              fontWeight: 600,
              cursor: pending ? "not-allowed" : "pointer",
            }}
            onMouseEnter={(e) => {
              if (!pending) e.currentTarget.style.background = "#F1F5F9";
            }}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
          >
            Batal
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={pending}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.4rem",
              minWidth: 110,
              padding: "0.5rem 1rem",
              border: "none",
              borderRadius: 8,
              background: "#FFC348",
              color: "#0F172A",
              fontSize: "0.75rem",
              fontWeight: 700,
              cursor: pending ? "wait" : "pointer",
              transition: "background-color 0.15s ease",
            }}
            onMouseEnter={(e) => {
              if (!pending) e.currentTarget.style.background = "#F0B53D";
            }}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#FFC348")}
          >
            {pending ? (
              <>
                <Spinner size={13} /> Menyimpan…
              </>
            ) : (
              "Simpan Perubahan"
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
