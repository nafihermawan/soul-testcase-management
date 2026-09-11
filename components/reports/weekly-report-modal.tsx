"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, X } from "lucide-react";
import { Toast, useToast } from "@/components/ui/feedback";

/**
 * Modal preview laporan mingguan: menampilkan Subject + body siap-email,
 * dengan tombol salin ke clipboard. Body dirender di <textarea readOnly>
 * supaya bisa diseleksi manual juga kalau clipboard diblokir browser.
 */
export function WeeklyReportModal({
  subject,
  body,
  onClose,
}: {
  subject: string;
  body: string;
  onClose: () => void;
}) {
  const [copiedSubject, setCopiedSubject] = useState(false);
  const [copiedBody, setCopiedBody] = useState(false);
  const { toast, showToast, dismissToast } = useToast();

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

  const copy = async (text: string, which: "subject" | "body") => {
    try {
      await navigator.clipboard.writeText(text);
      if (which === "subject") {
        setCopiedSubject(true);
        setTimeout(() => setCopiedSubject(false), 2000);
      } else {
        setCopiedBody(true);
        setTimeout(() => setCopiedBody(false), 2000);
      }
      showToast(which === "subject" ? "Subject disalin." : "Body email disalin.", "success");
    } catch {
      showToast("Gagal menyalin — blok teksnya lalu Ctrl/Cmd+C.", "error");
    }
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Weekly Testing Report"
      className="overlay-in"
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
      onClick={onClose}
    >
      <div
        className="modal-pop-in"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 720,
          maxHeight: "88vh",
          display: "flex",
          flexDirection: "column",
          background: "#fff",
          borderRadius: 12,
          boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "1rem 1.25rem",
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: "1.02rem", fontWeight: 700, color: "#0F172A" }}>
              Weekly Testing Report
            </h3>
            <p style={{ margin: "0.15rem 0 0", fontSize: "0.78rem", color: "#64748B" }}>
              Salin body ke email, lalu kirim ke penerima.
            </p>
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
              color: "#6B7280",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Subject */}
        <div style={{ padding: "0 1.25rem" }}>
          <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#64748B", marginBottom: "0.3rem" }}>
            SUBJECT
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span
              style={{
                flex: 1,
                minWidth: 0,
                padding: "0.45rem 0.6rem",
                border: "1px solid #E2E8F0",
                borderRadius: 6,
                background: "#F8FAFC",
                fontSize: "0.82rem",
                fontWeight: 600,
                color: "#0F172A",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {subject}
            </span>
            <button
              type="button"
              onClick={() => void copy(subject, "subject")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.3rem",
                padding: "0.45rem 0.7rem",
                borderRadius: 6,
                border: "1px solid #E2E8F0",
                background: "#fff",
                color: "#334155",
                fontSize: "0.75rem",
                fontWeight: 600,
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              {copiedSubject ? <Check size={13} /> : <Copy size={13} />}
              {copiedSubject ? "Tersalin" : "Salin"}
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: "0.9rem 1.25rem 0", display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
          <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#64748B", marginBottom: "0.3rem" }}>
            BODY EMAIL
          </div>
          <textarea
            readOnly
            value={body}
            spellCheck={false}
            onFocus={(e) => e.currentTarget.select()}
            style={{
              width: "100%",
              flex: 1,
              minHeight: 240,
              maxHeight: "46vh",
              resize: "vertical",
              padding: "0.7rem 0.8rem",
              border: "1px solid #E2E8F0",
              borderRadius: 8,
              background: "#F8FAFC",
              color: "#0F172A",
              fontSize: "0.8rem",
              lineHeight: 1.55,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
              outline: "none",
            }}
          />
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            gap: "0.625rem",
            padding: "1rem 1.25rem 1.25rem",
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            className="btn-rounded-md"
            style={{
              padding: "0.5rem 1rem",
              borderRadius: 6,
              border: "1px solid #E2E8F0",
              background: "#fff",
              color: "#334155",
              fontWeight: 500,
              fontSize: "0.75rem",
              cursor: "pointer",
            }}
          >
            Tutup
          </button>
          <button
            type="button"
            onClick={() => void copy(body, "body")}
            className="btn-rounded-md"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.35rem",
              padding: "0.5rem 1rem",
              borderRadius: 6,
              border: "none",
              background: "#FFC348",
              color: "#0F172A",
              fontWeight: 700,
              fontSize: "0.75rem",
              cursor: "pointer",
              boxShadow: "0 1px 2px rgba(15, 23, 42, 0.08)",
            }}
          >
            {copiedBody ? <Check size={13} /> : <Copy size={13} />}
            {copiedBody ? "Tersalin" : "Copy Body"}
          </button>
        </div>
      </div>

      <Toast toast={toast} onDismiss={dismissToast} />
    </div>,
    document.body
  );
}
