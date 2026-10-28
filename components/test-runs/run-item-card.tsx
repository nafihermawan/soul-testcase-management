"use client";

import { Bug, Paperclip } from "lucide-react";
import { entityCode } from "@/lib/format";
import { FONT_MONO, ROW_STATUS, type RunResultItem } from "./run-executor-shared";

/* Baris item test case (flat list) dalam accordion project/suite */
export function RunItemCard({
  item,
  isCompleted,
  canEdit,
  onOpenDetail,
  onOpenBugDetail,
  onOpenBug,
}: {
  item: RunResultItem;
  isCompleted: boolean;
  canEdit: boolean;
  onOpenDetail: () => void;
  /** Buka Bug Detail Modal untuk bug yang menempel di hasil eksekusi ini. */
  onOpenBugDetail: (bugId: string) => void;
  onOpenBug: () => void;
}) {
  const attachedBugs = item.bugs ?? [];
  const st = ROW_STATUS[item.status];
  const evidenceCount = item.attachments?.length ?? 0;
  /** Actual result ditampilkan saat eksekusi gagal atau terblokir. */
  const showActualResult =
    (item.status === "FAIL" || item.status === "BLOCKED") && !!item.actualResult;
  /** Tautan "Buat Bug" muncul saat FAIL, belum ada bug, run masih aktif. */
  const canCreateBug =
    attachedBugs.length === 0 && item.status === "FAIL" && !isCompleted && canEdit;

  /**
   * Satu item bug: ikon + ID polos (tanpa pill/background), monospace 500 merah.
   * Underline-nya saat hover ada di `.tc-bug-link` (globals.css) karena itu
   * pseudo-class yang tidak bisa dinyatakan inline.
   */
  const bugLinkStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: 0,
    border: "none",
    background: "transparent",
    color: "#B91C1C",
    fontFamily: FONT_MONO,
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    whiteSpace: "nowrap",
  };

  const renderBugLinks = () => (
    <>
      {attachedBugs.map((b) => (
        <button
          key={b.id}
          type="button"
          className="tc-bug-link"
          title="Buka detail bug"
          aria-label={`Buka bug ${entityCode("BUG", b.id)}`}
          onClick={(e) => {
            e.stopPropagation();
            onOpenBugDetail(b.id);
          }}
          style={bugLinkStyle}
        >
          <Bug size={14} aria-hidden="true" /> {entityCode("BUG", b.id)}
        </button>
      ))}
      {canCreateBug && (
        <button
          type="button"
          className="tc-bug-link"
          title="Buat bug dari hasil eksekusi ini"
          onClick={(e) => {
            e.stopPropagation();
            onOpenBug();
          }}
          style={bugLinkStyle}
        >
          <Bug size={14} aria-hidden="true" /> Buat Bug
        </button>
      )}
    </>
  );

  /** Baris meta hanya dirender kalau ada bug, attachment, atau aksi Buat Bug. */
  const hasMeta = attachedBugs.length > 0 || evidenceCount > 0 || canCreateBug;

  return (
    /* Indent 58px = sejajar awal teks nama sub-folder (30 + chevron 16 + gap 12). */
    <div style={{ paddingLeft: 58 }}>
      <div
        onClick={onOpenDetail}
        onMouseEnter={(e) => (e.currentTarget.style.background = "#FAFAFB")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        style={{
          // Bug & attachment adalah BAGIAN dari baris ini, jadi garis pemisah
          // selalu di bawah satu kesatuan baris — dan ikut mulai dari indent.
          padding: "14px 8px",
          borderBottom: "1px solid #EEF0F3",
          background: "transparent",
          cursor: "pointer",
          transition: "background-color 150ms ease",
        }}
      >
        {/* Grid: 210px (ID) | 1fr (konten) | 120px (status) */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "210px minmax(0, 1fr) 120px",
            alignItems: "start",
            gap: 16,
          }}
        >
          <span
            title={item.testCase?.tcId ?? undefined}
            style={{
              fontFamily: FONT_MONO,
              fontSize: 13,
              lineHeight: "22px",
              color: "#64748B",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {item.testCase?.tcId ?? "—"}
          </span>

          {/* Konten: judul di baris 1, meta bug/attachment di baris 2. */}
          <div style={{ minWidth: 0, display: "flex", flexDirection: "column" }}>
            <span
              title={item.titleSnapshot}
              style={{
                fontSize: 15,
                lineHeight: "22px",
                color: "#0F172A",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {item.titleSnapshot}
            </span>

            {hasMeta && (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: 16,
                  marginTop: 6,
                  fontSize: 13,
                }}
              >
                {renderBugLinks()}
                {evidenceCount > 0 && (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      color: "#64748B",
                    }}
                  >
                    <Paperclip size={14} aria-hidden="true" />
                    {evidenceCount} {evidenceCount === 1 ? "attachment" : "attachments"}
                  </span>
                )}
              </div>
            )}
          </div>

          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: 7,
              fontSize: 14,
              fontWeight: 600,
              lineHeight: "22px",
              color: st.text,
              whiteSpace: "nowrap",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: st.dot,
                flexShrink: 0,
              }}
            />
            {st.label}
          </span>
        </div>

        {/* Box Actual Result — hanya saat Failed/Blocked; tepi kiri rata dengan
            kolom judul (210px + gap 16). Link bug-nya kini di baris meta. */}
        {showActualResult && (
          <div
            style={{
              margin: "8px 0 0 226px",
              padding: "10px 14px",
              background: "#FFFBFB",
              border: "1px solid #FBE1E1",
              borderRadius: 10,
              display: "flex",
              flexDirection: "column",
              gap: 3,
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 600, color: "#991B1B" }}>Actual Result</span>
            <span
              style={{ fontSize: 13, lineHeight: 1.55, color: "#334155", whiteSpace: "pre-wrap" }}
            >
              {item.actualResult}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
