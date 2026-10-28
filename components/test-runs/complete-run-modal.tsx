"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { AlertCircle, Bug, CheckCircle2, Unlink, X } from "lucide-react";
import { BulletText } from "@/components/ui/bullet-text";
import { Spinner } from "@/components/ui/feedback";
import { entityCode } from "@/lib/format";
import { isActiveBugStatus } from "@/lib/qa-metrics";
import {
  BUG_STATUS_BADGE,
  FONT_MONO,
  ROW_STATUS,
  type ActiveRunBug,
  type RunResultItem,
} from "./run-executor-shared";

/**
 * Dot + teks status bug AKTIF di daftar penghambat. `OPEN` sesuai spesifikasi
 * (#DC2626 / #B91C1C); `IN_PROGRESS` memakai amber yang sudah dipakai aplikasi
 * untuk status itu (spesifikasi tidak menyebutnya).
 */
const ACTIVE_BUG_TONE: Record<string, { bg: string; dot: string; text: string }> = {
  OPEN: { bg: "#FEE2E2", dot: "#DC2626", text: "#B91C1C" },
  IN_PROGRESS: { bg: "#FEF3C7", dot: "#D97706", text: "#B45309" },
};

/* Modal: ringkasan hasil pengujian sebelum run diselesaikan (Completion Summary). */
export function CompleteRunModal({
  items,
  untested,
  activeBugs,
  overallNotes,
  onOverallNotesChange,
  onDetach,
  onOpenBug,
  onCancel,
  onConfirm,
  completing,
}: {
  items: RunResultItem[];
  untested: number;
  /** Bug aktif yang menahan penyelesaian run (quality gate). */
  activeBugs: ActiveRunBug[];
  overallNotes: string;
  onOverallNotesChange: (v: string) => void;
  /**
   * Lepaskan bug dari run. Menerima beberapa id sekaligus untuk aksi
   * "Unlink All Bugs"; mengembalikan `error` bila ada yang gagal.
   */
  onDetach: (bugIds: string[]) => Promise<{ error?: string }>;
  /** Buka Bug Detail Modal (ditumpuk di atas modal ini, z-index lebih tinggi). */
  onOpenBug: (bugId: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  completing: boolean;
}) {
  /** Gate: masih ada bug aktif => run tidak boleh diselesaikan. */
  const blocked = activeBugs.length > 0;
  /** Konfirmasi pelepasan: `"all"` untuk aksi borongan, atau daftar id bug. */
  const [confirmDetach, setConfirmDetach] = useState<"all" | string[] | null>(null);
  const [detaching, setDetaching] = useState(false);
  const [detachError, setDetachError] = useState<string | null>(null);
  const titleId = useId();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || completing) return;
      // Esc menutup konfirmasi dulu; baru setelah itu menutup modalnya.
      if (confirmDetach) setConfirmDetach(null);
      else onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel, completing, confirmDetach]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const runDetach = async () => {
    if (!confirmDetach || detaching) return;
    // Untuk aksi borongan, daftarnya diambil SAAT INI juga supaya percobaan
    // ulang setelah sebagian gagal tidak mengulang bug yang sudah lepas.
    const ids = confirmDetach === "all" ? activeBugs.map((b) => b.id) : confirmDetach;
    if (ids.length === 0) {
      setConfirmDetach(null);
      return;
    }
    setDetaching(true);
    setDetachError(null);
    const res = await onDetach(ids);
    setDetaching(false);
    if (res.error) {
      setDetachError(res.error);
      return;
    }
    setConfirmDetach(null);
  };

  /** Bug aktif (Open / In Progress) yang menempel ke satu hasil eksekusi. */
  const activeBugsOf = (it: RunResultItem) =>
    (it.bugs ?? []).filter((b) => isActiveBugStatus(b.status));

  /**
   * Item yang dirender di CASE NOTES.
   *
   * Dulu HANYA TC yang punya catatan/actual result — akibatnya TC berstatus
   * Passed/Skipped yang masih menampung bug aktif tidak pernah muncul, padahal
   * bug itulah yang memblokir Complete Run. Sekarang sebuah TC tampil kalau:
   * punya catatan, ATAU statusnya Failed, ATAU punya bug aktif.
   */
  const noted = items.filter(
    (i) =>
      (i.notes ?? "").trim() ||
      (i.actualResult ?? "").trim() ||
      i.status === "FAIL" ||
      activeBugsOf(i).length > 0
  );

  /** Label section: "CASE NOTES · n" / "OVERALL TESTING NOTES (opsional)". */
  const sectionLabelStyle: React.CSSProperties = {
    display: "block",
    fontSize: 13,
    fontWeight: 600,
    color: "#64748B",
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    marginBottom: 10,
  };

  /** Label di dalam satu catatan (Actual Result / Notes). */
  const noteLabelStyle: React.CSSProperties = {
    display: "block",
    fontSize: 12,
    fontWeight: 600,
    color: "#64748B",
    marginBottom: 2,
  };

  return createPortal(
    <div
      className="complete-run-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={() => {
        if (!completing) onCancel();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 260,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        background: "rgba(15, 23, 42, 0.55)",
        backdropFilter: "blur(4px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 680,
          maxWidth: "100%",
          maxHeight: "calc(100vh - 80px)",
          background: "#fff",
          borderRadius: 16,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 24px 48px rgba(15, 23, 42, 0.25)",
          animation: "modalIn 0.18s ease-out",
          // Jadi acuan konfirmasi pelepasan bug yang menumpuk di dalam kartu.
          position: "relative",
        }}
      >
        {/* ---------- HEADER (tetap) ---------- */}
        <div
          style={{
            flex: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            padding: "20px 24px 20px 28px",
            borderBottom: "1px solid #EEF0F3",
          }}
        >
          <h3 id={titleId} style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#0F172A" }}>
            Complete Test Run
          </h3>
          <button
            type="button"
            className="btn-radius-10 crm-close"
            onClick={onCancel}
            disabled={completing}
            aria-label="Tutup"
            title="Tutup"
            style={{
              width: 40,
              height: 40,
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "none",
              borderRadius: 10,
              color: "#475569",
              cursor: completing ? "not-allowed" : "pointer",
            }}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {/* ---------- BODY (satu-satunya area scroll) ---------- */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            padding: "24px 28px",
            display: "flex",
            flexDirection: "column",
            gap: 28,
          }}
        >
          {/* Peringatan bug aktif — hanya bila memang ada. */}
          {blocked ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                border: "1px solid #FECACA",
                borderRadius: 12,
                overflow: "hidden",
                /**
                 * WAJIB `flexShrink: 0`: body modal adalah flex column yang
                 * scroll. Dengan `overflow: hidden`, min-height banner jadi 0
                 * sehingga ia ikut menyusut — dulu kolaps jadi 2px dan SELURUH
                 * daftar bug aktif jadi tak terlihat walau footer tetap
                 * menghitungnya.
                 */
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  background: "#FEF2F2",
                  padding: "16px 18px",
                }}
              >
                <AlertCircle
                  size={20}
                  aria-hidden="true"
                  style={{ color: "#DC2626", flexShrink: 0, marginTop: 1 }}
                />
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "#991B1B" }}>
                    {activeBugs.length} bug masih aktif
                  </div>
                  <div style={{ marginTop: 4, fontSize: 14, lineHeight: "21px", color: "#7F1D1D" }}>
                    Run belum bisa diselesaikan. Selesaikan bug di tracker, atau unlink dari run
                    ini.
                  </div>
                  {/* Catatan sinkronisasi: paragraf kecil di AREA MERAH yang sama
                      (bukan banner kuning terpisah). Tampil hanya bila memang ada
                      bug aktif yang menempel pada TC berstatus bukan Failed. */}
                  {activeBugs.some((b) => b.resultStatus !== "FAIL") && (
                    <div
                      style={{ marginTop: 2, fontSize: 13, lineHeight: "20px", color: "#7F1D1D" }}
                    >
                      <strong style={{ fontWeight: 600 }}>Catatan:</strong> bug ini menempel pada
                      test case yang statusnya bukan Failed. Unlink agar ringkasan run dan Bugs
                      Tracker tetap konsisten.
                    </div>
                  )}
                </div>
              </div>

              {activeBugs.map((b) => {
                const code = entityCode("BUG", b.id);
                const tone = ACTIVE_BUG_TONE[b.status] ?? ACTIVE_BUG_TONE.OPEN;
                return (
                  <div
                    key={b.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr auto",
                      alignItems: "center",
                      gap: 16,
                      background: "#fff",
                      padding: "14px 18px",
                      borderTop: "1px solid #FEE2E2",
                    }}
                  >
                    {/* Kiri: (1) ID + status, (2) judul, (3) path suite. */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                      <div
                        style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}
                      >
                        {/* ID bug = link ke detail bug (merah, bukan abu-abu). */}
                        <button
                          type="button"
                          className="crm-bug-link"
                          onClick={() => onOpenBug(b.id)}
                          title="Buka detail bug"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            padding: 0,
                            border: "none",
                            background: "transparent",
                            fontFamily: FONT_MONO,
                            fontSize: 13,
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          <Bug size={14} aria-hidden="true" />
                          {code}
                        </button>
                        {/* Status: dot 7px + teks, TANPA pill. */}
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <span
                            aria-hidden="true"
                            style={{
                              width: 7,
                              height: 7,
                              borderRadius: "50%",
                              background: tone.dot,
                              flexShrink: 0,
                            }}
                          />
                          <span style={{ fontSize: 13, fontWeight: 600, color: tone.text }}>
                            {BUG_STATUS_BADGE[b.status].label}
                          </span>
                        </span>
                      </div>

                      {/* Judul bug: membungkus, TIDAK di-truncate. */}
                      <div
                        style={{
                          fontSize: 15,
                          lineHeight: "22px",
                          fontWeight: 600,
                          color: "#0F172A",
                          overflowWrap: "anywhere",
                        }}
                      >
                        {b.title}
                      </div>

                      {/* Path suite DI BAWAH judul. */}
                      {b.suiteName && (
                        <div style={{ fontSize: 13, color: "#64748B" }}>{b.suiteName}</div>
                      )}
                    </div>

                    {/* Kanan: SATU tombol Unlink (detail bug lewat link ID di atas). */}
                    <button
                      type="button"
                      className="btn-radius-10 crm-unlink"
                      onClick={() => {
                        setDetachError(null);
                        setConfirmDetach([b.id]);
                      }}
                      disabled={detaching}
                      aria-label={`Unlink ${code} dari run`}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        height: 40,
                        padding: "0 12px",
                        borderRadius: 10,
                        fontSize: 14,
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                        cursor: detaching ? "not-allowed" : "pointer",
                      }}
                    >
                      <Unlink size={16} aria-hidden="true" /> Unlink
                    </button>
                  </div>
                );
              })}

              {/* Baris aksi bawah */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  background: "#fff",
                  padding: "12px 18px",
                  borderTop: "1px solid #FEE2E2",
                }}
              >
                <Link
                  href="/bugs"
                  className="crm-tracker-link"
                  style={{ fontSize: 14, fontWeight: 600 }}
                >
                  Buka Bugs Tracker →
                </Link>
                <button
                  type="button"
                  className="btn-radius-10 crm-unlink-all"
                  onClick={() => {
                    setDetachError(null);
                    setConfirmDetach("all");
                  }}
                  disabled={detaching}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    height: 40,
                    padding: "0 14px",
                    borderRadius: 10,
                    fontSize: 14,
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                    cursor: detaching ? "not-allowed" : "pointer",
                  }}
                >
                  <Unlink size={16} aria-hidden="true" /> Unlink All Bugs
                </button>
              </div>
            </div>
          ) : (
            /* Tidak ada bug aktif → state sukses. */
            <div
              role="status"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                border: "1px solid #BBF7D0",
                borderRadius: 12,
                background: "#F0FDF4",
                padding: "14px 18px",
                fontSize: 14,
                color: "#166534",
              }}
            >
              <CheckCircle2
                size={20}
                aria-hidden="true"
                style={{ color: "#16A34A", flexShrink: 0 }}
              />
              <span>
                <strong style={{ fontWeight: 600 }}>Tidak ada bug aktif.</strong> Run siap
                diselesaikan.
              </span>
            </div>
          )}

          {detachError && (
            <div role="alert" style={{ fontSize: 14, color: "#B91C1C" }}>
              {detachError}
            </div>
          )}

          {untested > 0 && (
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                border: "1px solid #FDE68A",
                borderRadius: 12,
                background: "#FFFBEB",
                padding: "14px 18px",
                fontSize: 14,
                lineHeight: "21px",
                color: "#B45309",
              }}
            >
              <span aria-hidden="true">⚠️</span>
              <span>
                Masih terdapat <strong>{untested} Test Case</strong> yang belum dieksekusi. Test
                Case tersebut akan otomatis ditandai sebagai <strong>Skipped</strong>.
              </span>
            </div>
          )}

          {/* ---------- CASE NOTES ---------- */}
          <div>
            <div style={sectionLabelStyle}>
              Case Notes <span style={{ color: "#94A3B8" }}>· {noted.length}</span>
            </div>
            <div style={{ border: "1px solid #E5E7EB", borderRadius: 12 }}>
              {noted.length === 0 ? (
                <div
                  style={{
                    padding: "14px 18px",
                    fontSize: 14,
                    color: "#94A3B8",
                    fontStyle: "italic",
                  }}
                >
                  Tidak ada catatan spesifik pada test case.
                </div>
              ) : (
                noted.map((it, i) => {
                  const st = ROW_STATUS[it.status];
                  return (
                    <div
                      key={it.id}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                        padding: "14px 18px",
                        borderTop: i === 0 ? "none" : "1px solid #EEF0F3",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 12,
                        }}
                      >
                        <span style={{ fontFamily: FONT_MONO, fontSize: 13, color: "#64748B" }}>
                          {it.testCase?.tcId ?? "—"}
                        </span>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <span
                            aria-hidden="true"
                            style={{
                              width: 7,
                              height: 7,
                              borderRadius: "50%",
                              background: st.dot,
                              flexShrink: 0,
                            }}
                          />
                          <span style={{ fontSize: 13, fontWeight: 600, color: st.text }}>
                            {st.label}
                          </span>
                        </span>
                      </div>

                      <div
                        style={{
                          fontSize: 15,
                          lineHeight: "22px",
                          fontWeight: 600,
                          color: "#0F172A",
                        }}
                      >
                        {it.titleSnapshot}
                      </div>

                      {/* Bug aktif milik TC ini — termasuk TC yang statusnya
                          BUKAN Failed (di situlah bug-nya dulu tidak terlihat). */}
                      {activeBugsOf(it).map((bug) => {
                        const bugTone = ACTIVE_BUG_TONE[bug.status] ?? ACTIVE_BUG_TONE.OPEN;
                        const bugCode = entityCode("BUG", bug.id);
                        return (
                          <div
                            key={bug.id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                              flexWrap: "wrap",
                              marginTop: 2,
                            }}
                          >
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 6,
                                padding: "2px 8px",
                                borderRadius: 6,
                                background: bugTone.bg,
                                color: bugTone.text,
                                fontSize: 12,
                                fontWeight: 600,
                              }}
                            >
                              <span
                                aria-hidden="true"
                                style={{
                                  width: 6,
                                  height: 6,
                                  borderRadius: "50%",
                                  background: bugTone.dot,
                                }}
                              />
                              {BUG_STATUS_BADGE[bug.status].label}
                            </span>
                            <span style={{ fontFamily: FONT_MONO, fontSize: 12, color: "#94A3B8" }}>
                              {bugCode}
                            </span>
                            <button
                              type="button"
                              className="crm-detach-link"
                              onClick={() => {
                                setDetachError(null);
                                setConfirmDetach([bug.id]);
                              }}
                              disabled={detaching}
                              aria-label={`Unlink ${bugCode} dari run`}
                            >
                              Unlink
                            </button>
                          </div>
                        );
                      })}

                      {/* TC bisa muncul karena Failed / punya bug tanpa catatan. */}
                      {(it.actualResult ?? "").trim() === "" && (it.notes ?? "").trim() === "" && (
                        <div
                          style={{
                            marginTop: 2,
                            fontSize: 13,
                            color: "#94A3B8",
                            fontStyle: "italic",
                          }}
                        >
                          Belum ada catatan.
                        </div>
                      )}

                      {(it.actualResult ?? "").trim() !== "" && (
                        <div style={{ marginTop: 2 }}>
                          <span style={noteLabelStyle}>Actual Result</span>
                          <BulletText
                            text={it.actualResult as string}
                            itemStyle={{ fontSize: 14, lineHeight: "21px", color: "#334155" }}
                          />
                        </div>
                      )}
                      {(it.notes ?? "").trim() !== "" && (
                        <div style={{ marginTop: 2 }}>
                          <span style={noteLabelStyle}>Notes</span>
                          <BulletText
                            text={it.notes as string}
                            itemStyle={{ fontSize: 14, lineHeight: "21px", color: "#334155" }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* ---------- OVERALL TESTING NOTES ---------- */}
          <div>
            <label htmlFor="overall-testing-notes" style={sectionLabelStyle}>
              Overall Testing Notes{" "}
              <span
                style={{
                  textTransform: "none",
                  letterSpacing: 0,
                  fontSize: 13,
                  fontWeight: 500,
                  color: "#94A3B8",
                }}
              >
                (opsional)
              </span>
            </label>
            <textarea
              id="overall-testing-notes"
              value={overallNotes}
              onChange={(e) => onOverallNotesChange(e.target.value)}
              rows={4}
              placeholder="Tulis ringkasan hasil pengujian, kendala, atau catatan untuk tim…"
              style={{
                width: "100%",
                padding: "12px 14px",
                border: "1px solid #E2E8F0",
                borderRadius: 10,
                fontSize: 15,
                lineHeight: "22px",
                color: "#0F172A",
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
          </div>
        </div>

        {/* ---------- FOOTER (sticky di bawah) ---------- */}
        <div
          style={{
            flex: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "16px 24px 16px 28px",
            borderTop: "1px solid #EEF0F3",
            background: "#FCFCFD",
          }}
        >
          <span style={{ fontSize: 14, color: "#475569" }}>
            {blocked ? `Tangani ${activeBugs.length} bug aktif untuk melanjutkan.` : ""}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              type="button"
              className="btn-radius-10 crm-cancel"
              onClick={onCancel}
              disabled={completing}
              style={{
                height: 44,
                padding: "0 18px",
                border: "none",
                borderRadius: 10,
                fontSize: 15,
                fontWeight: 600,
                cursor: completing ? "not-allowed" : "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-radius-10 crm-primary"
              onClick={onConfirm}
              disabled={completing || blocked}
              title={blocked ? "Selesaikan dulu Bug aktif yang tertaut ke run ini." : undefined}
              style={{
                height: 44,
                padding: "0 20px",
                border: "none",
                borderRadius: 10,
                fontSize: 15,
                fontWeight: 600,
                cursor: completing ? "wait" : blocked ? "not-allowed" : "pointer",
              }}
            >
              {completing ? "Menyelesaikan..." : "Complete Run"}
            </button>
          </div>
        </div>

        {/* Konfirmasi pelepasan bug — menumpuk DI DALAM kartu modal ini supaya
            tidak bertabrakan dengan lapisan modal lain di aplikasi. */}
        {confirmDetach && (
          <div
            role="alertdialog"
            aria-modal="true"
            aria-label="Lepas bug dari Test Run"
            onClick={() => {
              if (!detaching) setConfirmDetach(null);
            }}
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "1.25rem",
              background: "rgba(15, 23, 42, 0.45)",
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "100%",
                maxWidth: 380,
                background: "#fff",
                borderRadius: 16,
                boxShadow: "0 24px 48px rgba(15, 23, 42, 0.25)",
                padding: "20px 22px",
              }}
            >
              <h4 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#0F172A" }}>
                {confirmDetach === "all"
                  ? "Unlink semua bug dari Test Run?"
                  : "Unlink bug ini dari Test Run?"}
              </h4>
              <p style={{ margin: "6px 0 0", fontSize: 14, lineHeight: "21px", color: "#475569" }}>
                Bug akan dikonversi menjadi <strong>General Findings / Ad-hoc</strong> dan tidak
                lagi terikat pada run ini.
              </p>
              {detachError && (
                <p role="alert" style={{ margin: "8px 0 0", fontSize: 13, color: "#B91C1C" }}>
                  {detachError}
                </p>
              )}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
                <button
                  type="button"
                  className="btn-radius-8 crm-cancel"
                  autoFocus
                  onClick={() => setConfirmDetach(null)}
                  disabled={detaching}
                  style={{
                    height: 36,
                    padding: "0 14px",
                    border: "1px solid #E2E8F0",
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: detaching ? "not-allowed" : "pointer",
                  }}
                >
                  Batal
                </button>
                <button
                  type="button"
                  className="btn-radius-8 crm-unlink-all"
                  onClick={() => void runDetach()}
                  disabled={detaching}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    height: 36,
                    padding: "0 14px",
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: detaching ? "wait" : "pointer",
                  }}
                >
                  {detaching ? (
                    <>
                      <Spinner size={13} /> Melepas…
                    </>
                  ) : (
                    "Ya, Lepas"
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
