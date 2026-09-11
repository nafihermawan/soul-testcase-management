"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { AttachmentsPanel } from "@/components/attachments/attachments-panel";
import { entityCode } from "@/lib/format";
import type { AttachmentItem } from "@/types/api";

/** Modal evidence bug: lihat & upload screenshot/video yang menempel ke bug. */
export function BugAttachmentsModal({
  bugId,
  bugTitle,
  attachments,
  canEdit,
  onClose,
  onChange,
}: {
  bugId: string;
  bugTitle: string;
  attachments: AttachmentItem[];
  canEdit: boolean;
  onClose: () => void;
  /** Daftar attachment terbaru — dipakai parent untuk update in-place. */
  onChange?: (items: AttachmentItem[]) => void;
}) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Evidence Bug"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 300,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        background: "rgba(0,0,0,0.5)",
        backdropFilter: "blur(4px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 620,
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          background: "#fff",
          borderRadius: 12,
          boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "0.75rem",
            padding: "1rem 1.25rem",
            borderBottom: "1px solid var(--border)",
            flexShrink: 0,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: "0.7rem", fontFamily: "var(--font-mono, monospace)", color: "#DC2626", fontWeight: 700 }}>
              {entityCode("BUG", bugId)}
            </div>
            <h3 style={{ margin: "0.15rem 0 0", fontSize: "1rem", fontWeight: 700 }}>{bugTitle}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              border: "none",
              background: "transparent",
              color: "var(--text-secondary)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <X size={17} />
          </button>
        </div>

        <div style={{ padding: "1.25rem", overflowY: "auto" }}>
          <AttachmentsPanel
            owner={{ bugId }}
            attachments={attachments}
            canEdit={canEdit}
            onChange={onChange}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}
