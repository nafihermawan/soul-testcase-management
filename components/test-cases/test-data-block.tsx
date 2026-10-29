"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/**
 * Bagian Test Data: baris header (label kiri + tombol "Salin" kanan) lalu isi
 * monospace polos tanpa kotak pembungkus. Tombol Salin hanya muncul bila test
 * data terisi.
 */
export function TestDataBlock({ data }: { data: string | null | undefined }) {
  const [copied, setCopied] = useState(false);
  const filled = !!data?.trim();

  const copy = async () => {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(data);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard tidak tersedia — abaikan
    }
  };

  return (
    <>
      {/* Header section: label di kiri, tombol Salin di kanan (hanya bila terisi). */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 8,
          minHeight: 32,
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: 12,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            color: "#64748B",
          }}
        >
          Test Data
        </h2>
        {filled && (
          <button
            type="button"
            onClick={() => void copy()}
            className="tc-copy-btn btn-radius-8"
            aria-label="Salin test data"
          >
            {copied ? (
              <>
                <Check size={14} /> Tersalin
              </>
            ) : (
              <>
                <Copy size={14} /> Salin
              </>
            )}
          </button>
        )}
      </div>

      {filled ? (
        // Tanpa kotak pembungkus: teks monospace polos, TIDAK di-wrap (setiap
        // baris tetap satu baris). Baris yang lebih panjang dari konten bisa
        // di-scroll mendatar.
        <pre
          style={{
            margin: 0,
            fontFamily: "var(--font-mono, ui-monospace, SFMono-Regular, monospace)",
            fontSize: 13,
            lineHeight: "22px",
            color: "#0F172A",
            whiteSpace: "pre",
            overflowX: "auto",
          }}
        >
          {data}
        </pre>
      ) : (
        <p style={{ margin: 0, fontSize: 14, color: "#64748B" }}>Tidak ada test data.</p>
      )}
    </>
  );
}
