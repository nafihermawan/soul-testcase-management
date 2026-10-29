"use client";

import Link from "next/link";
import { Flag, Pencil } from "lucide-react";
import { formatCase } from "@/lib/format";

/**
 * Warna status: dot + teks. Spesifikasi menyebut contoh Active; varian lain
 * memakai tonalitas sejenis (Draft amber, Deprecated slate).
 */
const STATUS_TONE: Record<string, { dot: string; text: string }> = {
  ACTIVE: { dot: "#16A34A", text: "#15803D" },
  DRAFT: { dot: "#F59E0B", text: "#B45309" },
  DEPRECATED: { dot: "#94A3B8", text: "#64748B" },
};

/** Warna bendera + teks untuk indikator prioritas. */
const PRIORITY_TONE: Record<string, { flag: string; text: string }> = {
  CRITICAL: { flag: "#DC2626", text: "#B91C1C" },
  HIGH: { flag: "#EA580C", text: "#C2410C" },
  MEDIUM: { flag: "#F59E0B", text: "#B45309" },
  LOW: { flag: "#94A3B8", text: "#475569" },
};

export function TestCasePageHeader({
  title,
  status,
  priority,
  project,
  suite,
  canEdit,
  showEdit,
  onEdit,
}: {
  title: string;
  status: "DRAFT" | "ACTIVE" | "DEPRECATED";
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  project: { id: string; name: string };
  suite: { id: string; name: string };
  canEdit: boolean;
  /** Tombol Edit hanya tampil saat tab "Detail" aktif. */
  showEdit: boolean;
  /** Membuka modal edit di halaman ini (tanpa pindah halaman). */
  onEdit: () => void;
}) {
  const statusTone = STATUS_TONE[status] ?? STATUS_TONE.DEPRECATED;
  const priorityTone = PRIORITY_TONE[priority] ?? PRIORITY_TONE.LOW;

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #E5E7EB",
        borderRadius: 16,
        padding: "22px 28px 24px",
      }}
    >
      {/* Breadcrumb — tanpa ID test case. */}
      <nav
        aria-label="Breadcrumb"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 14,
          flexWrap: "wrap",
        }}
      >
        <Link href="/" className="tc-crumb">
          Projects
        </Link>
        <span aria-hidden="true" style={{ color: "#CBD5E1" }}>
          /
        </span>
        <Link href={`/projects/${project.id}`} className="tc-crumb">
          {project.name}
        </Link>
        <span aria-hidden="true" style={{ color: "#CBD5E1" }}>
          /
        </span>
        <Link href={`/suites/${suite.id}`} className="tc-crumb">
          {suite.name}
        </Link>
      </nav>

      {/* Judul + meta + aksi */}
      <div
        style={{
          marginTop: 12,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1
            style={{
              margin: 0,
              fontSize: 24,
              lineHeight: "32px",
              fontWeight: 700,
              color: "#0F172A",
            }}
          >
            {title}
          </h1>

          {/* Baris meta: status (dot + teks) | divider | prioritas (bar + teks). */}
          <div
            style={{
              marginTop: 10,
              display: "flex",
              alignItems: "center",
              gap: 14,
              fontSize: 14,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                fontWeight: 600,
                color: statusTone.text,
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: statusTone.dot,
                }}
              />
              {formatCase(status)}
            </span>
            <span aria-hidden="true" style={{ width: 1, height: 16, background: "#E2E8F0" }} />
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontWeight: 600,
                color: priorityTone.text,
              }}
            >
              <Flag size={14} aria-hidden="true" color={priorityTone.flag} />
              {formatCase(priority)} priority
            </span>
          </div>
        </div>

        {/* Aksi: hanya Edit, hanya saat tab Detail aktif. Membuka modal edit
            di halaman ini (bukan navigate ke halaman suite). */}
        {canEdit && showEdit && (
          <button
            type="button"
            className="tc-btn-secondary"
            onClick={onEdit}
            style={{ flexShrink: 0 }}
          >
            <Pencil size={16} /> Edit
          </button>
        )}
      </div>
    </div>
  );
}
