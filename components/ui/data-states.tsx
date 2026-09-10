"use client";

import Link from "next/link";
import { ArrowLeft, RefreshCw, TriangleAlert } from "lucide-react";
import { Spinner } from "@/components/ui/feedback";

const baseBlock: React.CSSProperties = {
  background: "#fff",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-lg)",
  padding: "3rem 1.5rem",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "0.85rem",
  textAlign: "center",
};

/** Blok loading awal halaman (saat fetch pertama kali). */
export function LoadingBlock({ label = "Memuat data…" }: { label?: string }) {
  return (
    <div style={baseBlock}>
      <span style={{ color: "var(--text-muted)", display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
        <Spinner size={18} />
        <span style={{ fontSize: "0.85rem", fontWeight: 500 }}>{label}</span>
      </span>
    </div>
  );
}

/** Skeleton modular: meniru Card Header/Metadata (card atas). */
export function HeaderDetailSkeleton() {
  return (
    <div
      style={{
        width: "100%",
        background: "#fff",
        border: "1px solid #E5E7EB",
        borderRadius: "var(--radius-lg)",
        padding: "1.5rem",
        boxShadow: "0 1px 3px rgba(15, 23, 42, 0.06)",
        marginBottom: "1.5rem",
      }}
    >
      <div className="skeleton-block" style={{ width: 180, height: 12 }} />
      <div style={{ marginTop: "1rem" }}>
        <div className="skeleton-block" style={{ width: "45%", height: 24 }} />
        <div className="skeleton-block" style={{ width: "30%", height: 12, marginTop: "0.6rem" }} />
      </div>
      <div style={{ marginTop: "0.9rem" }}>
        <div className="skeleton-block" style={{ width: 90, height: 10 }} />
        <div className="skeleton-block" style={{ width: 140, height: 10, marginTop: "0.45rem" }} />
        <div className="skeleton-block" style={{ width: 120, height: 10, marginTop: "0.45rem" }} />
      </div>
    </div>
  );
}

/** Skeleton modular: meniru Card Tabel Test Case (card bawah). */
export function TableCardSkeleton() {
  return (
    <div
      style={{
        width: "100%",
        background: "#fff",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "0 1px 3px rgba(15, 23, 42, 0.06)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          padding: "0.6rem 0.9rem",
          background: "#F8FAFC",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div className="skeleton-block" style={{ width: 14, height: 14, borderRadius: 4 }} />
        <div className="skeleton-block" style={{ width: 140, height: 12 }} />
        <div className="skeleton-block" style={{ width: 70, height: 10, marginLeft: "auto" }} />
      </div>
      <div style={{ padding: "0.75rem" }}>
        <div className="skeleton-block" style={{ width: "100%", height: 34 }} />
        <div className="skeleton-block" style={{ width: "100%", height: 34, marginTop: "0.5rem" }} />
        <div className="skeleton-block" style={{ width: "100%", height: 34, marginTop: "0.5rem" }} />
        <div className="skeleton-block" style={{ width: "100%", height: 34, marginTop: "0.5rem" }} />
      </div>
    </div>
  );
}

/** Skeleton modular: baris kartu metrik/statistik (mis. summary cards dashboard). */
export function StatsCardsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))`, gap: "1rem" }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "1rem 1.25rem" }}>
          <div className="skeleton-block" style={{ width: "55%", height: 12 }} />
          <div className="skeleton-block" style={{ width: "35%", height: 22, marginTop: "0.6rem" }} />
        </div>
      ))}
    </div>
  );
}

/** Skeleton modular: meniru card form (beberapa baris label + input). */
export function FormCardSkeleton() {
  return (
    <div
      style={{
        width: "100%",
        background: "#fff",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "0 1px 3px rgba(15, 23, 42, 0.06)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "1rem 1.25rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div className="skeleton-block" style={{ width: 160, height: 16 }} />
        <div className="skeleton-block" style={{ width: 80, height: 32, borderRadius: 8 }} />
      </div>
      <div style={{ padding: "0 1.25rem 1.25rem", display: "flex", flexDirection: "column", gap: "0.9rem" }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
            <div className="skeleton-block" style={{ width: "30%", height: 10 }} />
            <div className="skeleton-block" style={{ width: "100%", height: 38, borderRadius: 8 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Susunan 2-card main layout: HeaderDetailSkeleton + TableCardSkeleton vertikal.
 *  Digunakan untuk halaman detail suite yang menampilkan kartu header + daftar test case. */
export function SuiteSkeleton() {
  return (
    <div style={{ width: "100%", fontFamily: "var(--font-sans, system-ui, sans-serif)" }}>
      <HeaderDetailSkeleton />
      <TableCardSkeleton />
    </div>
  );
}

/** Blok error fetch dengan tombol coba lagi. */
export function ErrorBlock({
  message = "Gagal memuat data.",
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div style={baseBlock}>
      <span
        style={{
          width: 44,
          height: 44,
          borderRadius: "50%",
          background: "#FEF2F2",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#DC2626",
        }}
      >
        <TriangleAlert size={22} />
      </span>
      <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
        {message}
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.4rem",
            padding: "0.5rem 1rem",
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "#fff",
            color: "var(--text)",
            fontWeight: 600,
            fontSize: "0.82rem",
            cursor: "pointer",
          }}
        >
          <RefreshCw size={13} /> Coba lagi
        </button>
      )}
    </div>
  );
}

/** Pengganti halaman 404 server (notFound) untuk detail yang fetch client. */
export function NotFoundBlock({
  title = "Data tidak ditemukan",
  message = "Data yang Anda cari mungkin sudah dihapus atau tidak tersedia.",
  backHref = "/",
  backLabel = "Kembali ke Beranda",
}: {
  title?: string;
  message?: string;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div style={baseBlock}>
      <h2 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700, color: "var(--text)" }}>{title}</h2>
      <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-muted)", lineHeight: 1.5 }}>
        {message}
      </p>
      <Link
        href={backHref}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.4rem",
          padding: "0.5rem 1rem",
          borderRadius: 8,
          border: "1px solid var(--border)",
          background: "#fff",
          color: "var(--text)",
          fontWeight: 600,
          fontSize: "0.82rem",
          textDecoration: "none",
        }}
      >
        <ArrowLeft size={13} /> {backLabel}
      </Link>
    </div>
  );
}
