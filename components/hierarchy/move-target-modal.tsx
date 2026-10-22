"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/feedback";
import { getJSON } from "@/lib/client/use-api";
import type { SuiteMoveTargetsPayload } from "@/types/api";

const NONE = "__none__";

export type MoveTarget = { suiteId: string; sectionId: string | null };

/**
 * Modal pemilih tujuan "Pindahkan" — SATU komponen untuk tiga pintu masuk:
 * bulk move (floating bar), single move (kebab baris TC), dan pindah Section.
 *
 * Daftar Suite dibatasi ke PROJECT YANG SAMA dan diambil saat modal dibuka
 * (`/api/suites/options`), karena halaman ini hanya tahu section suite-nya
 * sendiri. Daftar Section mengikuti Suite yang dipilih, sehingga tidak mungkin
 * memasangkan section milik suite lain.
 */
export function MoveTargetModal({
  mode,
  count = 1,
  itemLabel,
  currentSuiteId,
  projectId,
  onClose,
  onConfirm,
}: {
  mode: "testcase" | "section";
  /** Jumlah test case yang dipindah (mode "testcase"). */
  count?: number;
  /** Judul item: tcId untuk satu TC, atau nama section (mode "section"). */
  itemLabel: string;
  currentSuiteId: string;
  projectId: string;
  onClose: () => void;
  onConfirm: (target: MoveTarget) => Promise<void>;
}) {
  /** mode "section": wajib pilih suite LAIN, jadi mulai dari kosong. */
  const [suiteId, setSuiteId] = useState(mode === "section" ? "" : currentSuiteId);
  const [sectionId, setSectionId] = useState("");
  const [data, setData] = useState<SuiteMoveTargetsPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Ambil suite + section satu project saat modal dibuka.
  useEffect(() => {
    let cancelled = false;
    getJSON<SuiteMoveTargetsPayload>(`/api/suites/options?projectId=${projectId}`)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Gagal memuat daftar tujuan.");
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const selectedSuite = useMemo(
    () => data?.suites.find((s) => s.id === suiteId) ?? null,
    [data, suiteId]
  );

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

  const sameSuite = suiteId !== "" && suiteId === currentSuiteId;
  // Section hanya relevan untuk TC; sebuah section tidak bisa bersarang.
  const needsSection = mode === "testcase";
  const canSubmit =
    !pending &&
    !!data &&
    suiteId !== "" &&
    (!needsSection || sectionId !== "") &&
    // Pindah section ke suite yang sama tidak masuk akal (server menolaknya).
    !(mode === "section" && sameSuite);

  const submit = async () => {
    if (!canSubmit) return;
    setPending(true);
    try {
      await onConfirm({ suiteId, sectionId: sectionId === "" || sectionId === NONE ? null : sectionId });
    } finally {
      setPending(false);
    }
  };

  const label =
    mode === "section"
      ? "Pindahkan Section"
      : count > 1
        ? "Pindah Section / Suite"
        : "Pindah Test Case";

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 270,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        background: "rgba(0, 0, 0, 0.4)",
        backdropFilter: "blur(4px)",
      }}
      onClick={() => !pending && onClose()}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 380,
          background: "#fff",
          borderRadius: 12,
          padding: "1.25rem",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          border: "1px solid var(--border)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ fontSize: "0.95rem", fontWeight: 600, margin: "0 0 0.25rem", color: "#111827" }}>
          {label}
        </h3>
        <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: "0 0 1rem" }}>
          {mode === "section" ? (
            <>
              Pindahkan section <b>{itemLabel}</b> ke suite lain — test case di dalamnya ikut
              berpindah.
            </>
          ) : count > 1 ? (
            <>
              Pilih tujuan untuk <b>{count} test case terpilih</b>
            </>
          ) : (
            <>
              Pilih tujuan untuk <b>{itemLabel}</b>
            </>
          )}
        </p>

        {loadError ? (
          <div
            style={{
              fontSize: "0.78rem",
              color: "#B91C1C",
              background: "#FEF2F2",
              border: "1px solid #FECACA",
              borderRadius: 8,
              padding: "0.5rem 0.75rem",
              marginBottom: "1rem",
            }}
          >
            {loadError}
          </div>
        ) : !data ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              fontSize: "0.78rem",
              color: "var(--text-muted)",
              padding: "0.5rem 0",
              marginBottom: "1rem",
            }}
          >
            <Spinner size={14} /> Memuat daftar suite…
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1rem" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "#374151" }}>Suite tujuan</span>
              <Select
                value={suiteId}
                ariaLabel="Pilih suite tujuan"
                style={{ width: "100%" }}
                onChange={(e) => {
                  setSuiteId(e.target.value);
                  // Ganti suite → pilihan section lama tidak berlaku lagi.
                  setSectionId("");
                }}
              >
                <option value="" disabled>
                  -- Pilih Suite --
                </option>
                {data.suites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.id === currentSuiteId ? " (suite ini)" : ""}
                  </option>
                ))}
              </Select>
            </label>

            {needsSection && (
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "#374151" }}>
                  Section tujuan
                </span>
                <Select
                  value={sectionId}
                  ariaLabel="Pilih section tujuan"
                  style={{ width: "100%" }}
                  onChange={(e) => setSectionId(e.target.value)}
                  disabled={!selectedSuite}
                >
                  <option value="" disabled>
                    -- Pilih Section --
                  </option>
                  <option value={NONE}>Tanpa Section (Unassigned)</option>
                  {(selectedSuite?.sections ?? []).map((sec) => (
                    <option key={sec.id} value={sec.id}>
                      {sec.name}
                    </option>
                  ))}
                </Select>
              </label>
            )}

            {mode === "section" && sameSuite && (
              <p style={{ fontSize: "0.72rem", color: "#B45309", margin: 0 }}>
                Pilih suite lain — section ini sudah berada di suite tersebut.
              </p>
            )}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            style={{
              padding: "0.4rem 0.9rem",
              border: "1px solid #D1D5DB",
              borderRadius: 6,
              background: "#fff",
              color: "#374151",
              fontSize: "0.78rem",
              cursor: pending ? "not-allowed" : "pointer",
              opacity: pending ? 0.6 : 1,
            }}
          >
            Batal
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => void submit()}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.35rem",
              padding: "0.4rem 1rem",
              border: "none",
              borderRadius: 6,
              background: "#F59E0B",
              color: "#000000",
              fontSize: "0.78rem",
              fontWeight: 500,
              cursor: canSubmit ? "pointer" : "not-allowed",
              opacity: canSubmit ? 1 : 0.5,
            }}
          >
            {pending ? (
              <>
                <Spinner size={13} /> Memindahkan...
              </>
            ) : (
              "Pindahkan"
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
