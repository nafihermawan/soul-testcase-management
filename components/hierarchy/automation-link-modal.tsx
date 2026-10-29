"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

/**
 * Modal ringkas untuk menautkan / mengedit tautan automation sebuah Test Case.
 *
 * Field: External ID (wajib, kunci unik) + Script Path (opsional). Keduanya
 * disimpan ke AutomationLink (`externalTestId` & `scriptPath`) dengan status
 * AUTOMATED — bukan kolom baru di TestCase.
 */
export function AutomationLinkModal({
  mode,
  tcId,
  initialExternalId,
  initialScriptPath,
  pending,
  error,
  onClose,
  onSave,
}: {
  mode: "link" | "edit";
  /** ID Test Case yang sedang ditautkan (read-only, informasi). */
  tcId: string;
  initialExternalId: string;
  initialScriptPath: string;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (externalId: string, scriptPath: string) => void;
}) {
  const [externalId, setExternalId] = useState(initialExternalId);
  const [scriptPath, setScriptPath] = useState(initialScriptPath);
  const title = mode === "edit" ? "Edit Automation Link" : "Link to Automation Script";
  const canSave = externalId.trim().length > 0 && !pending;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const submit = () => {
    if (canSave) onSave(externalId.trim(), scriptPath.trim());
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        background: "rgba(0, 0, 0, 0.5)",
        backdropFilter: "blur(4px)",
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 480,
          background: "#fff",
          borderRadius: 16,
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          border: "1px solid var(--border)",
          padding: "20px 22px",
          animation: "modalIn 0.18s ease-out",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 14,
          }}
        >
          <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700, color: "#0F172A" }}>
            {title}
          </h3>
          <button
            type="button"
            aria-label="Tutup"
            onClick={onClose}
            style={{
              display: "flex",
              padding: 4,
              border: "none",
              background: "none",
              color: "#9CA3AF",
              cursor: "pointer",
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Sub-header: ID test case — teks biasa (tanpa pill/badge). */}
        <p style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 400, color: "#6B7280" }}>
          TC ID:{" "}
          <span style={{ fontFamily: "var(--font-mono, monospace)" }}>{tcId}</span>
        </p>

        {/* Field 1 — External ID */}
        <label
          htmlFor="automation-external-id"
          style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#64748B" }}
        >
          External ID
        </label>
        <input
          id="automation-external-id"
          autoFocus
          value={externalId}
          onChange={(e) => setExternalId(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder="Contoh: CY-002 / TC-AUTO-101"
          style={{
            width: "100%",
            marginTop: 6,
            padding: "0.55rem 0.75rem",
            border: "1px solid var(--border-strong)",
            borderRadius: 8,
            fontSize: "0.85rem",
            fontFamily: "var(--font-mono, monospace)",
          }}
        />

        {/* Field 2 — Script Path */}
        <label
          htmlFor="automation-script-path"
          style={{
            display: "block",
            marginTop: 14,
            fontSize: 13,
            fontWeight: 600,
            color: "#64748B",
          }}
        >
          Script Path
        </label>
        <input
          id="automation-script-path"
          value={scriptPath}
          onChange={(e) => setScriptPath(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder="Contoh: tests/auth/login-invalid.spec.ts"
          style={{
            width: "100%",
            marginTop: 6,
            padding: "0.55rem 0.75rem",
            border: "1px solid var(--border-strong)",
            borderRadius: 8,
            fontSize: "0.85rem",
            fontFamily: "var(--font-mono, monospace)",
          }}
        />

        {error && <div style={{ marginTop: 8, fontSize: "0.82rem", color: "#B91C1C" }}>{error}</div>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: 10,
              border: "1px solid #E2E8F0",
              background: "#fff",
              color: "#334155",
              fontWeight: 600,
              fontSize: "0.85rem",
              cursor: "pointer",
            }}
          >
            Batal
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSave}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: 10,
              border: "none",
              background: canSave ? "#F59E0B" : "#E2E8F0",
              color: canSave ? "#111827" : "#94A3B8",
              fontWeight: 700,
              fontSize: "0.85rem",
              cursor: canSave ? "pointer" : "not-allowed",
            }}
          >
            {pending ? "Menyimpan…" : "Simpan Tautan"}
          </button>
        </div>
      </div>
    </div>
  );
}
