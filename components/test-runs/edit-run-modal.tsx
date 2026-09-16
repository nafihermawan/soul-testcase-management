"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { ExpressRunForm, type ExpressRunInitial } from "@/components/test-runs/express-run";
import { ErrorBlock, FormCardSkeleton } from "@/components/ui/data-states";
import { useApi } from "@/lib/client/use-api";
import type { RunOptionsPayload } from "@/types/api";

/**
 * Modal Edit Run untuk halaman eksekusi — supaya user tidak perlu berpindah
 * halaman. Memakai `ExpressRunForm` yang sama dengan Create/Edit Express Run;
 * setelah simpan, pemanggil yang menyegarkan data (lihat `onSaved`).
 */
export function EditRunModal({
  runId,
  runName,
  initial,
  onClose,
  onSaved,
}: {
  runId: string;
  runName: string;
  initial: ExpressRunInitial;
  onClose: () => void;
  onSaved: () => void;
}) {
  const options = useApi<RunOptionsPayload>("/api/test-runs/options");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Edit Test Run"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 320,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        background: "rgba(15, 23, 42, 0.5)",
        backdropFilter: "blur(4px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 1100,
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          background: "#fff",
          borderRadius: 12,
          overflow: "hidden",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
            padding: "1rem 1.25rem",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: "#0F172A" }}>
              Edit Test Run: {runName}
            </div>
            <p style={{ margin: "0.2rem 0 0", fontSize: 13, color: "#6B7280" }}>
              Ubah detail run atau sesuaikan suite/test case yang ikut dieksekusi.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            style={{
              width: 30,
              height: 30,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "none",
              background: "transparent",
              color: "#6B7280",
              borderRadius: 6,
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Garis pemisah di-inset mengikuti padding body form (1.25rem) supaya
            sejajar vertikal dengan input field, bukan full-width modal. */}
        <div style={{ height: 1, background: "#E5E7EB", margin: "0 1.25rem", flexShrink: 0 }} />

        <div style={{ overflowY: "auto", flex: 1 }}>
          {options.error ? (
            <div style={{ padding: "1.25rem" }}>
              <ErrorBlock message={options.error.message} onRetry={options.reload} />
            </div>
          ) : !options.data ? (
            <div style={{ padding: "1.25rem" }}>
              <FormCardSkeleton />
            </div>
          ) : (
            <ExpressRunForm
              projectId=""
              projects={options.data.projects}
              mode="edit"
              runId={runId}
              initial={initial}
              onSaved={() => onSaved()}
            />
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
