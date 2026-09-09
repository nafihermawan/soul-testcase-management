"use client";

import Link from "next/link";
import { Wrench } from "lucide-react";

/** Empty state "Under Construction" yang dirender di dalam layout utama. */
export function UnderConstruction({ pageTitle }: { pageTitle: string }) {
  return (
    <div
      style={{
        fontFamily: "var(--font-sans, system-ui, sans-serif)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "60vh",
        textAlign: "center",
        padding: "0 1rem",
      }}
    >
      {/* Icon badge */}
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: "50%",
          background: "#FEF3C7",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#D97706",
          marginBottom: "1rem",
        }}
      >
        <Wrench size={30} />
      </div>

      {/* Heading */}
      <h2
        style={{
          fontSize: "1.25rem",
          fontWeight: 700,
          margin: "0 0 0.5rem",
          color: "var(--text)",
        }}
      >
        Halaman {pageTitle} Sedang Dalam Pengembangan
      </h2>
      <p
        style={{
          fontSize: "0.875rem",
          color: "var(--text-secondary)",
          maxWidth: 420,
          margin: "0 0 1.5rem",
          lineHeight: 1.5,
        }}
      >
        Kami sedang menyiapkan fitur ini agar bisa kamu gunakan segera. Silakan
        kembali lagi nanti!
      </p>

      {/* CTA */}
      <Link
        href="/"
        style={{
          background: "#F59E0B",
          color: "#000000",
          fontWeight: 400,
          padding: "0.6rem 1.25rem",
          borderRadius: "3px !important",
          fontSize: "0.875rem",
          textDecoration: "none",
          transition: "background-color 0.15s ease",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "#D97706")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "#F59E0B")}
      >
        Kembali ke Dashboard
      </Link>
    </div>
  );
}
