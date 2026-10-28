"use client";

import { useEffect } from "react";
import { buildReportPdfBlob } from "./report-action-bar";
import { downloadPdfBlob } from "./download-pdf-blob";
import { REPORT_PDF_READY } from "./report-pdf-message";

/**
 * Menjalankan pembuatan PDF OTOMATIS saat halaman report dibuka dengan
 * `?download=pdf`.
 *
 * Dipakai tombol "Export Report" di halaman Test Run: halaman ini dimuat di
 * iframe tak terlihat (satu-satunya tempat markup laporan berada) untuk
 * di-render jadi PDF. PDF-nya TIDAK diunduh dari sini, melainkan dikirim ke
 * halaman pemanggil lewat `postMessage` — unduhan harus dipicu dari dokumen yang
 * benar-benar dilihat pengguna, kalau tidak sebagian browser membuka PDF-nya di
 * tab baru (atribut `download` diabaikan di konteks iframe).
 */
export function ReportAutoDownload({ fileName }: { fileName: string }) {
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const blob = await buildReportPdfBlob();
        if (cancelled) return;
        if (window.parent !== window) {
          // Report dibuka di iframe: serahkan Blob ke halaman pemanggil.
          window.parent.postMessage(
            { type: REPORT_PDF_READY, ok: true, blob, fileName },
            window.location.origin
          );
        } else {
          // Report dibuka langsung sebagai halaman (tanpa iframe).
          downloadPdfBlob(blob, fileName);
        }
      } catch (err) {
        console.error("Gagal membuat PDF:", err);
        if (!cancelled && window.parent !== window) {
          window.parent.postMessage(
            { type: REPORT_PDF_READY, ok: false },
            window.location.origin
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fileName]);

  return null;
}
