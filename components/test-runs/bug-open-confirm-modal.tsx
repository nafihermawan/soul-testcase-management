"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Bug } from "lucide-react";
import { entityCode } from "@/lib/format";

/**
 * Gate Complete Run — masih ada bug OPEN yang tertaut ke run ini. Run TIDAK
 * langsung diselesaikan: QA memilih meninjau bug dulu, atau force complete
 * dengan alasan tertulis (wajib).
 */
export function BugOpenConfirmModal({
  bugs,
  reason,
  onReasonChange,
  onReview,
  onConfirm,
  completing,
}: {
  bugs: { id: string; title: string }[];
  reason: string;
  onReasonChange: (v: string) => void;
  onReview: () => void;
  onConfirm: () => void;
  completing: boolean;
}) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !completing) onReview();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onReview, completing]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Tombol force-complete hanya aktif kalau alasannya sudah diisi.
  const canConfirm = reason.trim().length > 0 && !completing;

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: "0.75rem",
    fontWeight: 700,
    color: "#64748B",
    marginBottom: "0.5rem",
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Selesaikan Test Run dengan Bug Open?"
      onClick={() => {
        if (!completing) onReview();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 270,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        background: "rgba(15, 23, 42, 0.45)",
        backdropFilter: "blur(4px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 560,
          maxHeight: "85vh",
          background: "#fff",
          borderRadius: 16,
          border: "1px solid #F1F5F9",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
          animation: "modalIn 0.18s ease-out",
        }}
      >
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            padding: "1.5rem",
            display: "flex",
            flexDirection: "column",
            gap: "1.1rem",
          }}
        >
          <h3 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 700, color: "#0F172A" }}>
            Selesaikan Test Run dengan Bug Open?
          </h3>

          {/* Warning + jumlah bug */}
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "0.5rem",
              padding: "0.7rem 0.85rem",
              borderRadius: 10,
              background: "#FFF7ED",
              border: "1px solid #FED7AA",
              color: "#9A3412",
              fontSize: "0.8rem",
              lineHeight: 1.5,
            }}
          >
            <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              Masih terdapat <strong>{bugs.length}</strong> bug aktif berstatus{" "}
              <strong>OPEN</strong> pada Test Run ini.
            </span>
          </div>

          {/* Daftar ringkas bug OPEN (ID + judul) */}
          <div>
            <span style={labelStyle}>Bug open ({bugs.length})</span>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                maxHeight: "11rem",
                overflowY: "auto",
              }}
            >
              {bugs.map((b, idx) => (
                <div
                  key={b.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    padding: "0.4rem 0",
                    borderBottom: idx < bugs.length - 1 ? "1px solid #F1F5F9" : "none",
                  }}
                >
                  <Bug size={12} style={{ flexShrink: 0, color: "#DC2626" }} />
                  <span
                    style={{
                      flexShrink: 0,
                      fontFamily: "var(--font-mono, monospace)",
                      fontSize: "0.7rem",
                      color: "#64748B",
                    }}
                  >
                    {entityCode("BUG", b.id)}
                  </span>
                  <span
                    title={b.title}
                    style={{
                      minWidth: 0,
                      fontSize: "0.78rem",
                      color: "#334155",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {b.title}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Alasan force-complete (wajib) */}
          <div>
            <label htmlFor="bug-open-reason" style={labelStyle}>
              Catatan / Remarks <span style={{ color: "#E11D48" }}>*</span>
            </label>
            <textarea
              id="bug-open-reason"
              value={reason}
              onChange={(e) => onReasonChange(e.target.value)}
              placeholder="Alasan menyelesaikan run meskipun masih ada bug open..."
              style={{
                width: "100%",
                height: 84,
                padding: "0.75rem",
                border: "1px solid #E2E8F0",
                borderRadius: 8,
                fontSize: "0.75rem",
                color: "#1F2937",
                background: "#fff",
                outline: "none",
                resize: "vertical",
                boxSizing: "border-box",
                transition: "border-color 0.15s ease, box-shadow 0.15s ease",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "#FBBF24";
                e.currentTarget.style.boxShadow = "0 0 0 2px #FDE68A";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "#E2E8F0";
                e.currentTarget.style.boxShadow = "none";
              }}
            />
            <p style={{ margin: "0.35rem 0 0", fontSize: "0.72rem", color: "#94A3B8" }}>
              Wajib diisi untuk menyelesaikan run saat bug masih OPEN.
            </p>
          </div>
        </div>

        <div
          style={{
            flex: "none",
            padding: "1rem 1.5rem",
            borderTop: "1px solid #F1F5F9",
            background: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: "0.75rem",
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            onClick={onReview}
            disabled={completing}
            style={{
              height: 34,
              padding: "0 0.85rem",
              fontSize: "0.75rem",
              fontWeight: 600,
              color: "#334155",
              background: "#fff",
              border: "1px solid #CBD5E1",
              borderRadius: 8,
              cursor: completing ? "not-allowed" : "pointer",
            }}
            onMouseEnter={(e) => {
              if (!completing) e.currentTarget.style.background = "#F8FAFC";
            }}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
          >
            Tinjau Bug History
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!canConfirm}
            title={canConfirm ? undefined : "Isi catatan dulu untuk melanjutkan"}
            style={{
              height: 34,
              padding: "0 1rem",
              fontSize: "0.75rem",
              fontWeight: 600,
              color: "#fff",
              background: "#DC2626",
              border: "none",
              borderRadius: 8,
              boxShadow: "0 1px 2px rgba(15, 23, 42, 0.08)",
              cursor: canConfirm ? "pointer" : "not-allowed",
              opacity: canConfirm ? 1 : 0.5,
              transition: "background-color 0.15s ease",
            }}
            onMouseEnter={(e) => {
              if (canConfirm) e.currentTarget.style.background = "#B91C1C";
            }}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#DC2626")}
          >
            {completing ? "Menyelesaikan..." : "Selesaikan dengan Catatan"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
