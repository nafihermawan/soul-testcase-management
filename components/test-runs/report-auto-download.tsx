"use client";

import { useEffect } from "react";
import { downloadReportPdf } from "./report-action-bar";
import { REPORT_PDF_READY } from "./report-pdf-message";

/**
 * Menjalankan unduhan PDF OTOMATIS saat halaman report dibuka dengan
 * `?download=pdf`.
 *
 * Dipakai tombol "Export Report" di halaman Test Run: halaman ini dimuat di
 * iframe tak terlihat (satu-satunya tempat markup laporan berada), dibuatkan
 * PDF-nya, lalu memberi tahu pemanggil lewat `postMessage` bahwa unduhan sudah
 * dimulai — sehingga spinner di tombol bisa berhenti tepat waktu.
 */
export function ReportAutoDownload({ fileName }: { fileName: string }) {
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let ok = true;
      try {
        await downloadReportPdf(fileName);
      } catch (err) {
        ok = false;
        console.error("Gagal membuat PDF:", err);
      }
      // Beri tahu parent (kalau halaman ini dibuka di dalam iframe).
      if (!cancelled && window.parent !== window) {
        window.parent.postMessage({ type: REPORT_PDF_READY, ok }, window.location.origin);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fileName]);

  return null;
}
