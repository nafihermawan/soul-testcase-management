"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { createBug } from "@/lib/actions/automation-bugs";
import type { BugDetailPayload, BugRow } from "@/types/api";

const SEVERITIES = [
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
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  marginBottom: "0.3rem",
};

const fieldStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid #E2E8F0",
  borderRadius: 8,
  padding: "0.5rem 0.75rem",
  fontSize: "0.75rem",
  color: "#1F2937",
  background: "#fff",
  outline: "none",
  boxSizing: "border-box",
};

/**
 * Form bug ad-hoc: mencatat temuan bebas yang tidak berasal dari eksekusi TC.
 * Sengaja TIDAK mengirim testCaseId/testRunResultId, sehingga bug ini otomatis
 * masuk kategori GENERAL_FINDING.
 */
export function ReportGeneralBugModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  /** Bug yang baru dibuat (bentuk BugRow lengkap) untuk ditambahkan ke daftar lokal. */
  onCreated: (bug: BugRow) => void;
}) {
  const [title, setTitle] = useState("");
  const [severity, setSeverity] = useState("MEDIUM");
  const [description, setDescription] = useState("");
  const [externalLink, setExternalLink] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, saving]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const save = async () => {
    if (saving) return;
    if (!title.trim()) {
      setError("Judul bug wajib diisi.");
      return;
    }
    setError(null);
    setSaving(true);
    const res = await createBug({
      title: title.trim(),
      description: description.trim() || undefined,
      severity: severity || undefined,
      externalLink: externalLink.trim() || undefined,
    });
    if (res.error) {
      setSaving(false);
      setError(res.error);
      return;
    }
    // Ambil bentuk lengkap baris bug (termasuk createdBy + sourceType) supaya
    // daftar bisa ditambah di tempat tanpa refetch halaman.
    try {
      const detail = await fetch(`/api/bugs/${res.bugId}`, { cache: "no-store" });
      if (detail.ok) {
        const data = (await detail.json()) as BugDetailPayload;
        onCreated(data.bug);
      }
    } catch {
      // Baris akan muncul setelah halaman dimuat ulang berikutnya.
    }
    setSaving(false);
    onClose();
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Laporkan Bug"
      onClick={() => {
        if (!saving) onClose();
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
          maxWidth: 512,
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
        <div
          style={{
            flexShrink: 0,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "0.75rem",
            padding: "1.25rem 1.5rem",
            borderBottom: "1px solid #F1F5F9",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: "#1E293B" }}>
              Laporkan Bug
            </h2>
            <p style={{ margin: "0.3rem 0 0", fontSize: "0.8rem", color: "#64748B", lineHeight: 1.5 }}>
              Temuan bebas di luar eksekusi test case. Bug ini masuk kategori{" "}
              <strong>General Findings</strong>.
            </p>
          </div>
          <button
            type="button"
            aria-label="Tutup"
            onClick={onClose}
            disabled={saving}
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
              cursor: saving ? "not-allowed" : "pointer",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#475569")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#94A3B8")}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            padding: "1.25rem 1.5rem",
            display: "flex",
            flexDirection: "column",
            gap: "1rem",
          }}
        >
          <div>
            <label htmlFor="general-bug-title" style={labelStyle}>
              Bug Title <span style={{ color: "#E11D48" }}>*</span>
            </label>
            <input
              id="general-bug-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={saving}
              placeholder="Ringkasan singkat isu/bug yang ditemukan..."
              style={fieldStyle}
            />
          </div>

          <div>
            <label htmlFor="general-bug-severity" style={labelStyle}>
              Severity
            </label>
            <select
              id="general-bug-severity"
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
              disabled={saving}
              style={{ ...fieldStyle, cursor: saving ? "not-allowed" : "pointer" }}
            >
              {SEVERITIES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="general-bug-desc" style={labelStyle}>
              Deskripsi &amp; Hasil Aktual
            </label>
            <textarea
              id="general-bug-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={saving}
              rows={4}
              placeholder="Jelaskan temuan, langkah reproduksi, dan dampaknya..."
              style={{ ...fieldStyle, resize: "vertical", lineHeight: 1.55 }}
            />
          </div>

          <div>
            <label htmlFor="general-bug-link" style={labelStyle}>
              Link Eksternal <span style={{ fontWeight: 500, textTransform: "none" }}>(opsional)</span>
            </label>
            <input
              id="general-bug-link"
              type="url"
              value={externalLink}
              onChange={(e) => setExternalLink(e.target.value)}
              disabled={saving}
              placeholder="https://jira… / https://github…"
              style={fieldStyle}
            />
          </div>

          {error && <div style={{ fontSize: "0.75rem", color: "#B91C1C" }}>{error}</div>}
        </div>

        {/* Footer */}
        <div
          style={{
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: "0.75rem",
            padding: "1rem 1.5rem",
            borderTop: "1px solid #F1F5F9",
            background: "rgba(248, 250, 252, 0.5)",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            style={{
              padding: "0.5rem 1rem",
              border: "none",
              borderRadius: 8,
              background: "transparent",
              color: "#475569",
              fontSize: "0.75rem",
              fontWeight: 600,
              cursor: saving ? "not-allowed" : "pointer",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#F1F5F9")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            Batal
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            style={{
              padding: "0.5rem 1.25rem",
              border: "none",
              borderRadius: 8,
              background: "#0F172A",
              color: "#fff",
              fontSize: "0.75rem",
              fontWeight: 700,
              cursor: saving ? "wait" : "pointer",
              transition: "background-color 0.15s ease",
            }}
            onMouseEnter={(e) => {
              if (!saving) e.currentTarget.style.background = "#1E293B";
            }}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#0F172A")}
          >
            {saving ? "Menyimpan..." : "Laporkan Bug"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
