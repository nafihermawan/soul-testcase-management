"use client";

import { useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { WeeklyReportModal } from "@/components/reports/weekly-report-modal";
import { buildWeeklyReportEmail } from "@/lib/weekly-report";
import { getJSON } from "@/lib/client/use-api";
import type { WeeklyReportPayload } from "@/types/api";

/**
 * Tombol "Buat Laporan" (Weekly Testing Report) untuk header halaman.
 *
 * Data diambil saat tombol diklik — bukan saat halaman dimuat — supaya selalu
 * segar dan tidak membebani halaman Reports.
 */
export function WeeklyReportButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState<{ subject: string; body: string } | null>(null);

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await getJSON<WeeklyReportPayload>("/api/reports/weekly");
      setEmail(buildWeeklyReportEmail(payload));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyusun laporan.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {error && (
        <span
          title={error}
          style={{
            fontSize: 11,
            fontWeight: 500,
            color: "#E11D48",
            maxWidth: 200,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {error}
        </span>
      )}
      <button
        type="button"
        onClick={() => void generate()}
        disabled={loading}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          height: 32,
          padding: "0 12px",
          borderRadius: 8,
          border: "none",
          background: "#FFC348",
          color: "#0F172A",
          fontWeight: 700,
          fontSize: 12,
          cursor: loading ? "wait" : "pointer",
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        {loading ? (
          <>
            <Loader2 size={14} style={{ animation: "spin 0.8s linear infinite" }} /> Menyusun…
          </>
        ) : (
          <>
            <FileText size={14} /> Buat Laporan
          </>
        )}
      </button>

      {email && (
        <WeeklyReportModal
          subject={email.subject}
          body={email.body}
          onClose={() => setEmail(null)}
        />
      )}
    </>
  );
}
