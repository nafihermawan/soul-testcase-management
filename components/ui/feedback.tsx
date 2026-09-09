"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, Loader2, X, XCircle } from "lucide-react";

/* ---------- Spinner ---------- */
export function Spinner({ size = 14 }: { size?: number }) {
  return <Loader2 size={size} style={{ animation: "spin 0.8s linear infinite" }} />;
}

/* ---------- Toast ---------- */
export type ToastData = {
  show: boolean;
  message: string;
  type: "success" | "error";
};

export function useToast() {
  const [toast, setToast] = useState<ToastData>({ show: false, message: "", type: "success" });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ show: true, message, type });
    timer.current = setTimeout(() => {
      setToast((prev) => ({ ...prev, show: false }));
    }, 4000);
  };

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return { toast, showToast, dismissToast: () => setToast((t) => ({ ...t, show: false })) };
}

export function Toast({
  toast,
  onDismiss,
}: {
  toast: ToastData;
  onDismiss: () => void;
}) {
  if (!toast.show) return null;
  const isSuccess = toast.type === "success";
  return createPortal(
    <div
      role="status"
      style={{
        position: "fixed",
        top: "1.25rem",
        right: "1.25rem",
        zIndex: 300,
        display: "flex",
        alignItems: "center",
        gap: "0.6rem",
        background: "#fff",
        border: `1px solid ${isSuccess ? "#A7F3D0" : "#FECACA"}`,
        borderRadius: 10,
        boxShadow: "0 10px 30px rgba(17, 24, 39, 0.12)",
        padding: "0.7rem 1rem",
        maxWidth: 360,
        animation: "modalIn 0.18s ease-out",
      }}
    >
      {isSuccess ? (
        <CheckCircle2 size={18} style={{ color: "#10B981", flexShrink: 0 }} />
      ) : (
        <XCircle size={18} style={{ color: "#EF4444", flexShrink: 0 }} />
      )}
      <span style={{ fontSize: "0.82rem", fontWeight: 500, color: "#1F2937", lineHeight: 1.4 }}>
        {toast.message}
      </span>
      <button
        type="button"
        aria-label="Tutup notifikasi"
        onClick={onDismiss}
        style={{
          border: "none",
          background: "transparent",
          color: "#9CA3AF",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          padding: 2,
          flexShrink: 0,
        }}
      >
        <X size={14} />
      </button>
    </div>,
    document.body
  );
}

/* ---------- ConfirmDialog (pengganti window.confirm) ---------- */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Ya, Hapus",
  cancelLabel = "Batal",
  pending = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prev;
    };
  }, [open, onCancel]);

  if (!open) return null;

  return createPortal(
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={title}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 210,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        background: "rgba(0, 0, 0, 0.5)",
        backdropFilter: "blur(4px)",
      }}
      onClick={onCancel}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 400,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "0.75rem",
          background: "#ffffff",
          borderRadius: 12,
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          padding: "1.5rem",
          textAlign: "center",
          animation: "modalIn 0.18s ease-out",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Tutup"
          onClick={onCancel}
          style={{
            alignSelf: "flex-end",
            width: 28,
            height: 28,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "none",
            background: "transparent",
            color: "var(--text-secondary)",
            borderRadius: 6,
            cursor: "pointer",
          }}
        >
          <X size={16} />
        </button>

        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: "50%",
            background: "#FEE2E2",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#DC2626",
          }}
        >
          <AlertTriangle size={24} />
        </div>

        <h3 style={{ fontSize: "1.05rem", fontWeight: 700, margin: 0, color: "#111827" }}>
          {title}
        </h3>
        <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 }}>
          {message}
        </p>

        <div style={{ display: "flex", gap: "0.5rem", width: "100%", marginTop: "0.5rem" }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            style={{
              flex: 1,
              padding: "0.5rem 1rem",
              borderRadius: "3px !important",
              border: "1px solid #D1D5DB",
              background: "#fff",
              color: "#374151",
              fontWeight: 500,
              fontSize: "0.85rem",
              cursor: pending ? "not-allowed" : "pointer",
              transition: "background 0.15s ease",
            }}
            onMouseEnter={(e) => {
              if (!pending) e.currentTarget.style.background = "#F3F4F6";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "#fff";
            }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            style={{
              flex: 1,
              padding: "0.5rem 1rem",
              borderRadius: "3px !important",
              border: "none",
              background: "#DC2626",
              color: "#fff",
              fontWeight: 500,
              fontSize: "0.85rem",
              cursor: pending ? "not-allowed" : "pointer",
              transition: "background 0.15s ease",
            }}
            onMouseEnter={(e) => {
              if (!pending) e.currentTarget.style.background = "#B91C1C";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "#DC2626";
            }}
          >
            {pending ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                <Spinner size={13} /> Menghapus...
              </span>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
