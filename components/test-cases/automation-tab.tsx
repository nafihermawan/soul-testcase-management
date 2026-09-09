"use client";

import { useState } from "react";
import { Code2, Link2, Trash2 } from "lucide-react";
import { removeAutomationLink, upsertAutomationLink } from "@/lib/actions/automation-bugs";
import { useRefresh } from "@/lib/client/refresh-context";
import { ConfirmDialog, Spinner, Toast, useToast } from "@/components/ui/feedback";

export type AutomationInfo = {
  id: string;
  externalTestId: string;
  scriptPath: string | null;
  status: "NOT_AUTOMATED" | "AUTOMATED" | "FAILING" | "UNSTABLE";
  lastRunAt: string | null;
  lastResult: string | null;
};

const statusStyle: Record<AutomationInfo["status"], { bg: string; color: string; label: string }> =
  {
    AUTOMATED: { bg: "var(--success-bg)", color: "var(--success)", label: "Automated" },
    FAILING: { bg: "var(--danger-bg)", color: "var(--danger)", label: "Failing" },
    UNSTABLE: { bg: "var(--warning-bg)", color: "#B45309", label: "Unstable" },
    NOT_AUTOMATED: {
      bg: "var(--surface-muted)",
      color: "var(--text-secondary)",
      label: "Belum Automated",
    },
  };

export function AutomationTab({
  testCaseId,
  automation,
}: {
  testCaseId: string;
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

  if (!automation && !editing) {
    return (
      <div
        style={{
          background: "#fff",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-md)",
          padding: "2.5rem 1.5rem",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          gap: "0.9rem",
        }}
      >
        {/* Ilustrasi: ikon code/robot */}
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#EFF6FF",
            color: "#2563EB",
          }}
        >
          <Code2 size={28} />
        </div>

        <div>
          <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700, color: "#111827" }}>
            Test Case ini belum terhubung ke skrip otomatisasi
          </h3>
          <p
            style={{
              margin: "0.5rem auto 0",
              maxWidth: 480,
              fontSize: "0.88rem",
              color: "var(--text-muted)",
              lineHeight: 1.6,
            }}
          >
            Hubungkan test case ke skrip otomatisasi (Cypress, Playwright, atau Selenium) agar
            eksekusi regresi bisa berjalan otomatis dan hasilnya terpantau langsung di sini. Cukup
            isi External Test ID dan path skrip, lalu status kesehatan otomatisasi (Automated /
            Failing / Unstable) akan ter-update dari run terakhir.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setEditing(true)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.45rem",
            marginTop: "0.25rem",
            padding: "0.55rem 1.2rem",
            borderRadius: 8,
            border: "none",
            background: "#2563EB",
            color: "#fff",
            fontWeight: 600,
            fontSize: "0.85rem",
            cursor: "pointer",
            transition: "background-color 0.15s ease",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#1D4ED8")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "#2563EB")}
        >
          <Link2 size={15} /> Link Automation Script
        </button>
      </div>
    );
  }

  const st = statusStyle[automation?.status ?? "NOT_AUTOMATED"];

  return (
    <div style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      {!editing && automation ? (
        <>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "0.75rem",
              flexWrap: "wrap",
            }}
          >
            <div>
              <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontWeight: 600 }}>
                External Test ID
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.9rem", fontWeight: 700 }}>
                {automation.externalTestId}
              </div>
            </div>
            <span
              style={{
                display: "inline-block",
                padding: "0.2rem 0.6rem",
                borderRadius: 999,
                fontSize: "0.75rem",
                fontWeight: 700,
                background: st.bg,
                color: st.color,
              }}
            >
              {st.label}
            </span>
          </div>

          {automation.scriptPath && (
            <div>
              <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontWeight: 600 }}>
                Script Path
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.85rem" }}>
                {automation.scriptPath}
              </div>
            </div>
          )}

          {(automation.lastRunAt || automation.lastResult) && (
            <div
              style={{
                display: "flex",
                gap: "1.5rem",
                fontSize: "0.82rem",
                color: "var(--text-secondary)",
                borderTop: "1px solid var(--border)",
                paddingTop: "0.6rem",
              }}
            >
              <div>
                <span style={{ color: "var(--text-muted)" }}>Run terakhir: </span>
                {automation.lastRunAt
                  ? new Date(automation.lastRunAt).toLocaleString("id-ID")
                  : "—"}
              </div>
              <div>
                <span style={{ color: "var(--text-muted)" }}>Hasil: </span>
                {automation.lastResult ?? "—"}
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.25rem" }}>
            <button
              type="button"
              onClick={() => {
                setEditing(true);
                setExternalTestId(automation.externalTestId);
                setScriptPath(automation.scriptPath ?? "");
                setStatus(automation.status);
              }}
              style={{
                padding: "0.4rem 0.9rem",
                borderRadius: 8,
                border: "1px solid var(--border-strong)",
                background: "var(--surface-muted)",
                color: "var(--text-secondary)",
                fontWeight: 600,
                fontSize: "0.82rem",
                cursor: "pointer",
              }}
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => setConfirmRemove(true)}
              disabled={pending}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.35rem",
                padding: "0.4rem 0.9rem",
                borderRadius: 8,
                border: "1px solid var(--danger)",
                background: "#fff",
                color: "var(--danger)",
                fontWeight: 600,
                fontSize: "0.82rem",
                cursor: "pointer",
              }}
            >
              <Trash2 size={13} /> Hapus
            </button>
          </div>
        </>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.7rem" }}>
          <div>
            <label style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)" }}>
              External Test ID
            </label>
            <input
              value={externalTestId}
              onChange={(e) => setExternalTestId(e.target.value)}
              placeholder="cth: officer-login-success-01"
              style={{
                width: "100%",
                marginTop: "0.25rem",
                padding: "0.5rem 0.75rem",
                border: "1px solid var(--border-strong)",
                borderRadius: 8,
                fontSize: "0.85rem",
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)" }}>
              Script Path
            </label>
            <input
              value={scriptPath}
              onChange={(e) => setScriptPath(e.target.value)}
              placeholder="tests/e2e/officer/login.spec.ts"
              style={{
                width: "100%",
                marginTop: "0.25rem",
                padding: "0.5rem 0.75rem",
                border: "1px solid var(--border-strong)",
                borderRadius: 8,
                fontSize: "0.85rem",
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)" }}>
              Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as AutomationInfo["status"])}
              style={{
                width: "100%",
                marginTop: "0.25rem",
                padding: "0.5rem 0.75rem",
                border: "1px solid var(--border-strong)",
                borderRadius: 8,
                fontSize: "0.85rem",
                background: "#fff",
              }}
            >
              <option value="NOT_AUTOMATED">Belum Automated</option>
              <option value="AUTOMATED">Automated</option>
              <option value="FAILING">Failing</option>
              <option value="UNSTABLE">Unstable</option>
            </select>
          </div>

          {error && <div style={{ fontSize: "0.82rem", color: "var(--danger)" }}>{error}</div>}

          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
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
              onClick={save}
              disabled={pending}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.35rem",
                padding: "0.45rem 1rem",
                borderRadius: 8,
                border: "none",
                background: "#2563EB",
                color: "#fff",
                fontWeight: 600,
                fontSize: "0.84rem",
                cursor: pending ? "not-allowed" : "pointer",
              }}
            >
              {pending ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                  <Spinner size={13} /> Menyimpan...
                </span>
              ) : (
                <>
                  <Link2 size={14} /> Simpan
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Confirm hapus automation link */}
      <ConfirmDialog
        open={confirmRemove}
        title="Hapus Link Automation?"
        message={<>Link automation untuk test case ini akan dihapus permanen.</>}
        pending={pending}
        onConfirm={() => void remove()}
        onCancel={() => setConfirmRemove(false)}
      />

      {/* Toast */}
      <Toast toast={toast} onDismiss={dismissToast} />
    </div>
  );
}
