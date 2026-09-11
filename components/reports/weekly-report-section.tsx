"use client";

import { useState } from "react";
import { CalendarRange, FileText, Loader2 } from "lucide-react";
import { Card, PanelHeader } from "@/components/ui";
import { WeeklyReportModal } from "@/components/reports/weekly-report-modal";
import { buildWeeklyReportEmail } from "@/lib/weekly-report";
import { getJSON } from "@/lib/client/use-api";
import { formatPct } from "@/lib/qa-metrics";
import type { WeeklyReportPayload } from "@/types/api";

/**
 * Section laporan progres testing mingguan (untuk dikirim tiap Jumat).
 * Data diambil saat tombol diklik — bukan saat halaman dimuat — supaya selalu
 * segar dan tidak membebani halaman Reports.
 */
export function WeeklyReportSection() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState<{ subject: string; body: string } | null>(null);
  const [summary, setSummary] = useState<WeeklyReportPayload["summary"] | null>(null);

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await getJSON<WeeklyReportPayload>("/api/reports/weekly");
      setSummary(payload.summary);
      setEmail(buildWeeklyReportEmail(payload));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyusun laporan.");
    } finally {
      setLoading(false);
    }
  };

  const isEmpty =
    summary !== null && summary.runningTasks === 0 && summary.doneTasks === 0;

  return (
    <>
      <Card>
        <PanelHeader title="Weekly Testing Report" />
        <div
          style={{
            padding: "1rem 1.25rem 1.25rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: "0.6rem", minWidth: 0 }}>
            <CalendarRange size={18} style={{ color: "#94A3B8", flexShrink: 0, marginTop: 2 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: "0.86rem", color: "var(--text)", fontWeight: 600 }}>
                Rangkum task yang sedang / baru selesai testing
              </div>
              <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: 2 }}>
                Menghasilkan body email siap kirim ke CTO, PM, dan Engineering Manager.
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void generate()}
            disabled={loading}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.4rem",
              padding: "0.5rem 1.1rem",
              borderRadius: 8,
              border: "none",
              background: "#FFC348",
              color: "#0F172A",
              fontWeight: 700,
              fontSize: "0.82rem",
              cursor: loading ? "wait" : "pointer",
              flexShrink: 0,
            }}
          >
            {loading ? (
              <>
                <Loader2 size={14} style={{ animation: "spin 0.8s linear infinite" }} />
                Menyusun…
              </>
            ) : (
              <>
                <FileText size={14} /> Buat Laporan
              </>
            )}
          </button>
        </div>

        {/* Ringkasan singkat setelah laporan dibuat */}
        {summary && !isEmpty && (
          <div
            style={{
              borderTop: "1px solid var(--border)",
              padding: "0.7rem 1.25rem",
              fontSize: "0.78rem",
              color: "var(--text-muted)",
            }}
          >
            {summary.runningTasks} task berjalan · {summary.doneTasks} selesai ·{" "}
            {summary.totalTC} TC · pass rate {formatPct(summary.passRate)} · {summary.openBugs} bug
            terbuka
          </div>
        )}

        {error && (
          <div
            style={{
              borderTop: "1px solid var(--border)",
              padding: "0.7rem 1.25rem",
              fontSize: "0.78rem",
              color: "var(--danger)",
            }}
          >
            {error}
          </div>
        )}
      </Card>

      {email && <WeeklyReportModal subject={email.subject} body={email.body} onClose={() => setEmail(null)} />}
    </>
  );
}
