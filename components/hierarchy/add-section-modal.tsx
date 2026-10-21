"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Layers, X } from "lucide-react";

export function AddSectionModal({
  onClose,
  onSave,
  sectionTitle,
  setSectionTitle,
  sectionDesc,
  setSectionDesc,
}: {
  onClose: () => void;
  onSave: () => void;
  sectionTitle: string;
  setSectionTitle: (v: string) => void;
  sectionDesc: string;
  setSectionDesc: (v: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Tambah Section Baru"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        background: "rgba(15, 23, 42, 0.4)",
        backdropFilter: "blur(4px)",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 480,
          display: "flex",
          flexDirection: "column",
          background: "#ffffff",
          borderRadius: 12,
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          overflow: "hidden",
          animation: "modalIn 0.18s ease-out",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "1rem 1.25rem",
            borderBottom: "1px solid var(--border)",
            background: "var(--surface-muted)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: "#FEF3C7",
                color: "#F59E0B",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Layers size={17} />
            </div>
            <h3 style={{ fontSize: "1rem", fontWeight: 600, margin: 0 }}>Tambah Section Baru</h3>
          </div>
          <button
            type="button"
            aria-label="Tutup"
            onClick={onClose}
            style={{
              width: 30,
              height: 30,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "none",
              background: "transparent",
              color: "var(--text-muted)",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.6rem",
              padding: "0.6rem 0.75rem",
              background: "var(--surface-muted)",
              border: "1px solid var(--border)",
              borderRadius: 10,
            }}
          >
            <Layers size={18} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
            <input
              ref={inputRef}
              value={sectionTitle}
              onChange={(e) => setSectionTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSave();
              }}
              placeholder="Masukkan Nama Section..."
              style={{
                flex: 1,
                border: "none",
                outline: "none",
                background: "transparent",
                fontSize: "0.95rem",
                minWidth: 0,
              }}
            />
          </div>
          <div>
            <label
              style={{
                fontSize: "0.72rem",
                fontWeight: 500,
                color: "var(--text-muted)",
                display: "block",
                marginBottom: "0.35rem",
              }}
            >
              Deskripsi Singkat (Opsional)
            </label>
            <textarea
              value={sectionDesc}
              onChange={(e) => setSectionDesc(e.target.value)}
              rows={2}
              placeholder="Tambahkan catatan singkat tentang section ini..."
              style={{
                width: "100%",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: "0.55rem 0.7rem",
                fontSize: "0.85rem",
                outline: "none",
                resize: "none",
              }}
            />
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "0.6rem",
            padding: "0.9rem 1.25rem",
            borderTop: "1px solid var(--border)",
            background: "var(--surface-muted)",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "0.45rem 1.1rem",
              borderRadius: 3,
              border: "1px solid #D1D5DB",
              background: "#fff",
              color: "#374151",
              fontWeight: 500,
              fontSize: "0.85rem",
              cursor: "pointer",
            }}
          >
            Batal
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={!sectionTitle.trim()}
            style={{
              padding: "0.45rem 1.2rem",
              borderRadius: 3,
              border: "none",
              background: "#F59E0B",
              color: "#000000",
              fontWeight: 400,
              fontSize: "0.85rem",
              cursor: sectionTitle.trim() ? "pointer" : "not-allowed",
              opacity: sectionTitle.trim() ? 1 : 0.5,
              transition: "background-color 0.15s ease",
            }}
            onMouseEnter={(e) => {
              if (sectionTitle.trim()) e.currentTarget.style.background = "#D97706";
            }}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#F59E0B")}
          >
            Simpan
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
