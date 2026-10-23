"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { REPORT_PDF_READY } from "./report-pdf-message";

/**
 * Unduh PDF report TANPA meninggalkan halaman (dipakai tombol Export Report di
 * halaman Test Run dan tombol Report di tabel Run History).
 *
 * Markup laporan formal hanya ada di route `/test-runs/<id>/report`, jadi route
 * itu dimuat di iframe tak terlihat (tetap dirender — hanya digeser keluar
 * layar — supaya html2canvas bisa mengukurnya). `ReportAutoDownload` di sana
 * membuat PDF lalu mengirim `REPORT_PDF_READY`; spinner berhenti tepat saat
 * unduhan dimulai.
 *
 * @param onError dipanggil bila pembuatan PDF gagal / melewati batas waktu.
 */
export function useReportPdfDownload(onError?: () => void) {
  const [downloading, setDownloading] = useState(false);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Callback disimpan di ref supaya listener pesan cukup dipasang sekali.
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const startPdfDownload = useCallback((runId: string) => {
    // Satu proses dalam satu waktu.
    if (frameRef.current) return;
    setDownloading(true);

    const frame = document.createElement("iframe");
    frame.src = `/test-runs/${runId}/report?download=pdf`;
    frame.title = "Menyiapkan PDF report";
    frame.setAttribute("aria-hidden", "true");
    frame.tabIndex = -1;
    frame.style.cssText = "position:fixed;left:-20000px;top:0;width:1100px;height:900px;border:0;";
    document.body.appendChild(frame);
    frameRef.current = frame;

    // Jaring pengaman bila halaman report gagal memuat / tidak mengirim pesan.
    timerRef.current = setTimeout(() => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      frameRef.current?.remove();
      frameRef.current = null;
      setDownloading(false);
      onErrorRef.current?.();
    }, 60_000);
  }, []);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      // Abaikan pesan dari luar origin ini atau saat tidak ada proses berjalan.
      if (e.origin !== window.location.origin) return;
      const frame = frameRef.current;
      if (!frame || e.source !== frame.contentWindow) return;
      const data = e.data as { type?: string; ok?: boolean } | null;
      if (data?.type !== REPORT_PDF_READY) return;

      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      // Spinner berhenti tepat saat unduhan dimulai; iframe baru dilepas
      // sedikit belakangan supaya proses unduhan tidak ikut terputus.
      setDownloading(false);
      frameRef.current = null;
      window.setTimeout(() => frame.remove(), 1500);

      if (!data.ok) onErrorRef.current?.();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // Bersihkan iframe + timer bila komponen ditinggalkan.
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      frameRef.current?.remove();
      frameRef.current = null;
    },
    []
  );

  return { downloading, startPdfDownload };
}
