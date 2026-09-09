"use client";

import { useState } from "react";
import { ArrowLeft, FileDown, Printer } from "lucide-react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/ui/feedback";

/** Tangkap elemen .report-container & simpan sebagai PDF via jsPDF + html2canvas. */
async function downloadContainerAsPdf(fileName: string): Promise<void> {
  const [{ jsPDF }, { default: html2canvas }] = await Promise.all([
    import("jspdf"),
    import("html2canvas"),
  ]);
  const el = document.querySelector<HTMLElement>(".report-container");
  if (!el) throw new Error("Konten report tidak ditemukan.");

  // Render canvas full-width resolusi tinggi; action bar (Kembali/Download/Print)
  // dibuang dari klon dokumen agar tidak ikut masuk hasil PDF.
  const canvas = await html2canvas(el, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
    windowWidth: el.scrollWidth,
    onclone: (doc) => {
      doc.querySelector(".report-action-bar")?.remove();
    },
  });

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = 210;
  const pageH = 297;
  const margin = 8;
  const contentW = pageW - margin * 2;
  const imgH = (canvas.height * contentW) / canvas.width;

  const y = margin;
  let remaining = imgH;
  let first = true;
  let pos = 0;
  while (remaining > 0) {
    const sliceH = Math.min(remaining, pageH - margin * 2);
    const slicePx = Math.ceil((sliceH * canvas.width) / contentW);
    const slice = canvas.getContext("2d")!.getImageData(0, pos, canvas.width, slicePx);
    const tmp = document.createElement("canvas");
    tmp.width = canvas.width;
    tmp.height = slicePx;
    tmp.getContext("2d")!.putImageData(slice, 0, 0);
    if (!first) pdf.addPage();
    pdf.addImage(tmp.toDataURL("image/png"), "PNG", margin, y, contentW, sliceH);
    first = false;
    pos += slicePx;
    remaining -= sliceH;
  }

  pdf.save(`${fileName || "test-run-report"}.pdf`);
}

export function ReportActionBar({
  detailUrl,
  fileName,
}: {
  detailUrl: string;
  fileName?: string;
}) {
  const router = useRouter();
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      await downloadContainerAsPdf(fileName ?? "test-run-report");
    } catch (err) {
      console.error("Gagal membuat PDF:", err);
      alert("Gagal membuat PDF. Coba gunakan Print > Save as PDF.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      className="report-action-bar"
      style={{
        position: "fixed",
        bottom: "1.5rem",
        right: "1.5rem",
        zIndex: 999,
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
      }}
    >
      <button
        type="button"
        onClick={() => router.push(detailUrl)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.35rem",
          padding: "0.45rem 0.9rem",
          borderRadius: 999,
          border: "1px solid #D1D5DB",
          background: "#fff",
          color: "#374151",
          fontSize: "0.82rem",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        <ArrowLeft size={14} /> Kembali
      </button>
      <button
        type="button"
        onClick={handleDownload}
        disabled={downloading}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.35rem",
          padding: "0.45rem 0.9rem",
          borderRadius: 999,
          border: "1px solid #D1D5DB",
          background: "#fff",
          color: "#374151",
          fontSize: "0.82rem",
          fontWeight: 600,
          cursor: downloading ? "wait" : "pointer",
        }}
      >
        {downloading ? (
          <>
            <Spinner size={13} /> Menyiapkan PDF…
          </>
        ) : (
          <>
            <FileDown size={14} /> Download PDF
          </>
        )}
      </button>
      <button
        type="button"
        onClick={() => window.print()}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.35rem",
          padding: "0.45rem 0.9rem",
          borderRadius: 999,
          border: "none",
          background: "#2563EB",
          color: "#fff",
          fontSize: "0.82rem",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        <Printer size={14} /> Print
      </button>
    </div>
  );
}
