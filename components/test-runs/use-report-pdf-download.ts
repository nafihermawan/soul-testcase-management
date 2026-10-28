"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { REPORT_PDF_READY, type ReportPdfReadyMessage } from "./report-pdf-message";
import { downloadPdfBlob } from "./download-pdf-blob";

/**
 * Unduh PDF report TANPA meninggalkan halaman (dipakai tombol Export Report di
 * halaman Test Run dan tombol Report di tabel Run History).
 *
 * Markup laporan formal hanya ada di route `/test-runs/<id>/report`, jadi route
 * itu dimuat di iframe tak terlihat (tetap dirender — hanya digeser keluar
 * layar — supaya html2canvas bisa mengukurnya). `ReportAutoDownload` di sana
 * membangun PDF-nya, lalu mengirim Blob-nya ke sini; unduhan dipicu dari
 * dokumen ini (halaman yang dilihat pengguna), bukan dari dalam iframe — kalau
 * dipicu di iframe, sebagian browser mengabaikan atribut `download` dan membuka
 * PDF-nya di tab baru.
 *
 * @param onError dipanggil bila pembuatan PDF gagal / melewati batas waktu.
 * @param onDownloaded dipanggil tepat saat unduhan dipicu — dipakai pemanggil
 *   untuk menampilkan konfirmasi singkat ("Report terunduh").
 */
export function useReportPdfDownload(onError?: () => void, onDownloaded?: () => void) {
  const [downloading, setDownloading] = useState(false);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Callback disimpan di ref supaya listener pesan cukup dipasang sekali.
  const onErrorRef = useRef(onError);
  const onDownloadedRef = useRef(onDownloaded);
  useEffect(() => {
    onErrorRef.current = onError;
    onDownloadedRef.current = onDownloaded;
  }, [onError, onDownloaded]);

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
      const data = e.data as ReportPdfReadyMessage | null;
      if (data?.type !== REPORT_PDF_READY) return;

      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setDownloading(false);
      frameRef.current = null;
      // Blob-nya sudah diterima di dokumen ini, jadi iframe boleh langsung
      // dilepas — unduhan tidak lagi bergantung padanya.
      frame.remove();

      if (data.ok && data.blob) {
        // Unduhan dipicu di dokumen yang dilihat pengguna (bukan di iframe),
        // supaya PDF-nya benar-benar ter-download tanpa membuka tab baru.
        downloadPdfBlob(data.blob, data.fileName ?? "test-run-report");
        onDownloadedRef.current?.();
      } else if (!data.ok) {
        onErrorRef.current?.();
      }
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
