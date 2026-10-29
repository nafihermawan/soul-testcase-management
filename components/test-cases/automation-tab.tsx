"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Link2Off, Pencil } from "lucide-react";
import { removeAutomationLink, upsertAutomationLink } from "@/lib/actions/automation-bugs";
import { useRefresh } from "@/lib/client/refresh-context";
import { getJSON } from "@/lib/client/use-api";
import { Spinner, Toast, useToast } from "@/components/ui/feedback";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { Select } from "@/components/ui/select";
import type { AutomationRunItem, AutomationRunsPayload } from "@/types/api";

export type AutomationInfo = {
  id: string;
  externalTestId: string;
  scriptPath: string | null;
  status: "NOT_AUTOMATED" | "AUTOMATED" | "FAILING" | "UNSTABLE";
  lastRunAt: string | null;
  lastResult: string | null;
};

/** Dot + teks status automation (tanpa pill). */
const STATUS_TONE: Record<
  AutomationInfo["status"],
  { dot: string; text: string; label: string }
> = {
  AUTOMATED: { dot: "#16A34A", text: "#15803D", label: "Automated" },
  FAILING: { dot: "#DC2626", text: "#B91C1C", label: "Failing" },
  UNSTABLE: { dot: "#F59E0B", text: "#B45309", label: "Unstable" },
  NOT_AUTOMATED: { dot: "#94A3B8", text: "#475569", label: "Belum Automated" },
};

/** Dot + teks hasil run. */
const RUN_TONE: Record<string, { dot: string; text: string; label: string }> = {
  PASS: { dot: "#16A34A", text: "#15803D", label: "Passed" },
  FAIL: { dot: "#DC2626", text: "#B91C1C", label: "Failed" },
  SKIPPED: { dot: "#A855F7", text: "#7E22CE", label: "Skipped" },
};
const RUN_FALLBACK = { dot: "#94A3B8", text: "#64748B", label: "—" };

const PAGE_SIZE = 5;

/** "29 Okt 2026, 15.41" (id-ID memakai titik untuk jam). */
const formatRanAt = (iso: string): string =>
  new Date(iso).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

/** Nilai monospace (truncate) + tombol salin 32×32. */
function CopyValue({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard tidak tersedia — abaikan
    }
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
      <span
        title={value}
        style={{
          fontFamily: "var(--font-mono, monospace)",
          fontSize: 14,
          fontWeight: 500,
          color: "#0F172A",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          minWidth: 0,
        }}
      >
        {value}
      </span>
      <button
        type="button"
        onClick={() => void copy()}
        className="tc-copy-icon-btn"
        aria-label={`Salin ${label}`}
        style={{
          width: 32,
          height: 32,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {copied ? <Check size={15} color="#15803D" /> : <Copy size={15} />}
      </button>
    </div>
  );
}

/** Satu baris <dl>: label 180px + nilai. */
function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "180px minmax(0, 1fr)",
        gap: 16,
        alignItems: "center",
        padding: "6px 0",
      }}
    >
      <dt style={{ fontSize: 14, color: "#64748B" }}>{label}</dt>
      <dd style={{ margin: 0, minWidth: 0 }}>{children}</dd>
    </div>
  );
}

/** Item ringkasan (Passed/Failed). */
function SummaryItem({
  dot,
  textColor,
  label,
  count,
}: {
  dot: string;
  textColor: string;
  label: string;
  count: number;
}) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span
        aria-hidden="true"
        style={{ width: 8, height: 8, borderRadius: "50%", background: dot, flexShrink: 0 }}
      />
      <span style={{ fontSize: 14, color: "#475569" }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 600, color: textColor }}>{count}</span>
    </span>
  );
}

export function AutomationTab({
  testCaseId,
  tcId,
  automation,
}: {
  /** id internal (cuid) — untuk aksi & fetch riwayat. */
  testCaseId: string;
  /** ID test case yang tampil (mis. web-lgn-001). */
  tcId: string;
  automation: AutomationInfo | null;
}) {
  const refresh = useRefresh();
  const [editing, setEditing] = useState(false);
  const [externalTestId, setExternalTestId] = useState(automation?.externalTestId ?? "");
  const [scriptPath, setScriptPath] = useState(automation?.scriptPath ?? "");
  const [status, setStatus] = useState<AutomationInfo["status"]>(
    automation?.status ?? "NOT_AUTOMATED"
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const { toast, showToast, dismissToast } = useToast();

  // --- Riwayat run (dipaginasi dari backend: 5 per halaman) ---
  const [runs, setRuns] = useState<AutomationRunItem[]>([]);
  const [total, setTotal] = useState(0);
  const [passed, setPassed] = useState(0);
  const [failed, setFailed] = useState(0);
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const automationId = automation?.id ?? null;
  const lastRunAt = automation?.lastRunAt ?? null;

  const loadFirstPage = useCallback(async () => {
    setLoadingRuns(true);
    try {
      const res = await getJSON<AutomationRunsPayload>(
        `/api/test-cases/${testCaseId}/automation-runs?offset=0&limit=${PAGE_SIZE}`
      );
      setRuns(res.runs);
      setTotal(res.total);
      setPassed(res.passed);
      setFailed(res.failed);
    } catch {
      // gagal memuat riwayat — biarkan kosong, bagian lain tetap tampil
    } finally {
      setLoadingRuns(false);
    }
  }, [testCaseId]);

  useEffect(() => {
    if (!automationId) {
      setRuns([]);
      setTotal(0);
      setPassed(0);
      setFailed(0);
      return;
    }
    void loadFirstPage();
  }, [automationId, lastRunAt, loadFirstPage]);

  const loadMore = async () => {
    if (loadingMore || runs.length >= total) return;
    setLoadingMore(true);
    try {
      const res = await getJSON<AutomationRunsPayload>(
        `/api/test-cases/${testCaseId}/automation-runs?offset=${runs.length}&limit=${PAGE_SIZE}`
      );
      setRuns((prev) => {
        const seen = new Set(prev.map((r) => r.id));
        return [...prev, ...res.runs.filter((r) => !seen.has(r.id))];
      });
      setTotal(res.total);
      setPassed(res.passed);
      setFailed(res.failed);
    } catch {
      // abaikan — tombol bisa dicoba lagi
    } finally {
      setLoadingMore(false);
    }
  };

  const save = async () => {
    setPending(true);
    setError(null);
    const res = await upsertAutomationLink(testCaseId, { externalTestId, scriptPath, status });
    setPending(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setEditing(false);
    showToast("Link automation disimpan.", "success");
    refresh();
  };

  const remove = async () => {
    setConfirmRemove(false);
    setPending(true);
    await removeAutomationLink(testCaseId);
    setPending(false);
    setEditing(false);
    showToast("Link automation dihapus.", "success");
    refresh();
  };

  const tone = STATUS_TONE[automation?.status ?? "NOT_AUTOMATED"];

  return (
    <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 16 }}>
      {editing ? (
        /* ---- Form hubungkan / edit (logika lama dipertahankan) ---- */
        <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: "#64748B" }}>
              External Test ID
            </label>
            <input
              value={externalTestId}
              onChange={(e) => setExternalTestId(e.target.value)}
              placeholder="cth: LG-001"
              style={{
                width: "100%",
                marginTop: 6,
                padding: "0.5rem 0.75rem",
                border: "1px solid var(--border-strong)",
                borderRadius: 8,
                fontSize: "0.85rem",
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: "#64748B" }}>
              Script Path
            </label>
            <input
              value={scriptPath}
              onChange={(e) => setScriptPath(e.target.value)}
              placeholder="tests/login/login.spec.ts"
              style={{
                width: "100%",
                marginTop: 6,
                padding: "0.5rem 0.75rem",
                border: "1px solid var(--border-strong)",
                borderRadius: 8,
                fontSize: "0.85rem",
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: "#64748B" }}>Status</label>
            <Select
              value={status}
              ariaLabel="Status automation"
              style={{ marginTop: 6, width: "100%" }}
              onChange={(e) => setStatus(e.target.value as AutomationInfo["status"])}
            >
              <option value="NOT_AUTOMATED">Belum Automated</option>
              <option value="AUTOMATED">Automated</option>
              <option value="FAILING">Failing</option>
              <option value="UNSTABLE">Unstable</option>
            </Select>
          </div>

          {error && <div style={{ fontSize: "0.82rem", color: "var(--danger)" }}>{error}</div>}

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setError(null);
              }}
              style={{
                padding: "0.45rem 1rem",
                borderRadius: 8,
                border: "1px solid var(--border-strong)",
                background: "#fff",
                color: "var(--text-secondary)",
                fontWeight: 600,
                fontSize: "0.84rem",
                cursor: "pointer",
              }}
            >
              Batal
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={pending}
              className="tc-btn-secondary"
            >
              {pending ? (
                <>
                  <Spinner size={13} /> Menyimpan...
                </>
              ) : (
                "Simpan"
              )}
            </button>
          </div>
        </div>
      ) : automation ? (
        /* ---- State terhubung ---- */
        <>
          {/* Baris atas: status (read-only) + aksi */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 12,
              padding: "16px 24px 6px",
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                fontSize: 14,
                fontWeight: 600,
                color: tone.text,
              }}
            >
              <span
                aria-hidden="true"
                style={{ width: 8, height: 8, borderRadius: "50%", background: tone.dot }}
              />
              {tone.label}
            </span>

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                type="button"
                className="tc-btn-secondary"
                onClick={() => {
                  setExternalTestId(automation.externalTestId);
                  setScriptPath(automation.scriptPath ?? "");
                  setStatus(automation.status);
                  setEditing(true);
                }}
              >
                <Pencil size={16} /> Edit
              </button>
              <button
                type="button"
                className="tc-unlink-btn"
                onClick={() => setConfirmRemove(true)}
                disabled={pending}
                aria-label="Unlink automation dari test case ini"
                title="Unlink automation"
                style={{
                  width: 40,
                  height: 40,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Link2Off size={18} />
              </button>
            </div>
          </div>

          {/* Informasi automation */}
          <dl style={{ margin: 0, padding: "4px 24px" }}>
            <InfoRow label="Test Case ID">
              <CopyValue value={tcId} label="Test Case ID" />
            </InfoRow>
            <InfoRow label="External Test ID">
              <CopyValue value={automation.externalTestId} label="External Test ID" />
            </InfoRow>
            <InfoRow label="Script Path">
              {automation.scriptPath ? (
                <CopyValue value={automation.scriptPath} label="Script Path" />
              ) : (
                <span style={{ fontSize: 14, color: "#64748B" }}>—</span>
              )}
            </InfoRow>
          </dl>

          {/* Riwayat run */}
          <div style={{ padding: "20px 24px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 12,
                marginBottom: 12,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: "#64748B",
                }}
              >
                Riwayat Run <span style={{ color: "#94A3B8" }}>· {total}</span>
              </div>
              {total > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
                  <SummaryItem dot="#16A34A" textColor="#15803D" label="Passed" count={passed} />
                  <SummaryItem dot="#DC2626" textColor="#B91C1C" label="Failed" count={failed} />
                </div>
              )}
            </div>

            {loadingRuns && total === 0 ? (
              <p style={{ margin: 0, fontSize: 14, color: "#64748B" }}>Memuat riwayat…</p>
            ) : total === 0 ? (
              <p style={{ margin: 0, fontSize: 14, color: "#64748B" }}>
                Script ini belum pernah dijalankan.
              </p>
            ) : (
              <>
                <div style={{ border: "1px solid #E5E7EB", borderRadius: 12, overflow: "hidden" }}>
                  {/* Header tabel */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "160px 1fr",
                      gap: 20,
                      height: 40,
                      alignItems: "center",
                      padding: "0 20px",
                      background: "#F8FAFC",
                      borderBottom: "1px solid #EEF0F3",
                      fontSize: 12,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      color: "#64748B",
                    }}
                  >
                    <span>Hasil</span>
                    <span>Waktu Eksekusi</span>
                  </div>
                  {runs.map((r, i) => {
                    const rt = RUN_TONE[r.status] ?? RUN_FALLBACK;
                    return (
                      <div
                        key={r.id}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "160px 1fr",
                          gap: 20,
                          alignItems: "center",
                          padding: "10px 20px",
                          borderTop: i === 0 ? "none" : "1px solid #EEF0F3",
                        }}
                      >
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <span
                            aria-hidden="true"
                            style={{
                              width: 7,
                              height: 7,
                              borderRadius: "50%",
                              background: rt.dot,
                              flexShrink: 0,
                            }}
                          />
                          <span style={{ fontSize: 14, fontWeight: 600, color: rt.text }}>
                            {rt.label}
                          </span>
                        </span>
                        <span
                          style={{
                            fontSize: 14,
                            color: "#334155",
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {formatRanAt(r.ranAt)}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Paginasi: load more */}
                <div
                  style={{
                    marginTop: 12,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: 12,
                  }}
                >
                  <span style={{ fontSize: 13, color: "#64748B" }}>
                    Menampilkan {runs.length} dari {total} run
                  </span>
                  {runs.length < total && (
                    <button
                      type="button"
                      className="tc-load-more-btn"
                      onClick={() => void loadMore()}
                      disabled={loadingMore}
                      style={{
                        height: 36,
                        padding: "0 14px",
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: loadingMore ? "not-allowed" : "pointer",
                      }}
                    >
                      {loadingMore
                        ? "Memuat…"
                        : `Tampilkan ${Math.min(PAGE_SIZE, total - runs.length)} lagi`}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </>
      ) : (
        /* ---- State belum terhubung ---- */
        <div
          style={{
            padding: "48px 24px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
            gap: 6,
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 600, color: "#0F172A" }}>
            Belum terhubung ke automation
          </div>
          <div style={{ fontSize: 14, color: "#64748B" }}>
            Hubungkan test case ini dengan script automation agar hasilnya tercatat otomatis.
          </div>
          <button
            type="button"
            className="tc-text-link"
            onClick={() => setEditing(true)}
            style={{ marginTop: 6 }}
          >
            + Hubungkan script
          </button>
        </div>
      )}

      <ConfirmDeleteDialog
        open={confirmRemove}
        itemType="Link Automation"
        pending={pending}
        onConfirm={() => void remove()}
        onCancel={() => setConfirmRemove(false)}
      />

      <Toast toast={toast} onDismiss={dismissToast} />
    </div>
  );
}
