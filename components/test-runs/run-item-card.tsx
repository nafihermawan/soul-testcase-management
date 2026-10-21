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
  const canCreateBug = attachedBugs.length === 0 && item.status === "FAIL" && !isCompleted && canEdit;

  /** Link bug polos (ikon + ID) — tanpa underline, hover menggelap. */
  const bugLinkStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: 0,
    border: "none",
    background: "transparent",
    color: "#B91C1C",
    fontFamily: FONT_MONO,
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    whiteSpace: "nowrap",
  };

  const renderBugLinks = () => (
    <>
      {attachedBugs.map((b) => (
        <button
          key={b.id}
          type="button"
          title="Buka detail bug"
          aria-label={`Buka bug ${entityCode("BUG", b.id)}`}
          onClick={(e) => {
            e.stopPropagation();
            onOpenBugDetail(b.id);
          }}
          style={bugLinkStyle}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#7F1D1D")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#B91C1C")}
        >
          <Bug size={14} aria-hidden="true" /> {entityCode("BUG", b.id)}
        </button>
      ))}
      {canCreateBug && (
        <button
          type="button"
          title="Buat bug dari hasil eksekusi ini"
          onClick={(e) => {
            e.stopPropagation();
            onOpenBug();
          }}
          style={bugLinkStyle}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#7F1D1D")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#B91C1C")}
        >
          <Bug size={14} aria-hidden="true" /> Buat Bug
        </button>
      )}
    </>
  );
  return (
    <div
      onClick={onOpenDetail}
      onMouseEnter={(e) => (e.currentTarget.style.background = "#F8FAFC")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      style={{
        margin: "0 18px 0 52px",
        padding: "12px 0",
        borderBottom: "1px solid #F1F4F8",
        background: "transparent",
        cursor: "pointer",
        transition: "background-color 0.15s ease",
      }}
    >
      {/* Satu baris: TC ID · judul · lampiran · status */}
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <span
          style={{
            width: 118,
            flexShrink: 0,
            fontFamily: FONT_MONO,
            fontSize: 12,
            fontWeight: 500,
            color: "#64748B",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {item.testCase?.tcId ?? "—"}
        </span>

        <span
          title={item.titleSnapshot}
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 14,
            fontWeight: 500,
            color: "#0F172A",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {item.titleSnapshot}
        </span>

        {evidenceCount > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenDetail();
            }}
            title={`${evidenceCount} lampiran`}
            aria-label={`${evidenceCount} lampiran`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 3,
              padding: 0,
              border: "none",
              background: "transparent",
              color: "#64748B",
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <Paperclip size={14} aria-hidden="true" />
            {evidenceCount}
          </button>
        )}

        <span
          style={{
            width: 96,
            flexShrink: 0,
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            fontSize: 13,
            fontWeight: 600,
            color: st.text,
            whiteSpace: "nowrap",
          }}
        >
          <span
            aria-hidden="true"
            style={{ width: 7, height: 7, borderRadius: "50%", background: st.dot, flexShrink: 0 }}
          />
          {st.label}
        </span>
      </div>

      {/* Box Actual Result — hanya saat Failed/Blocked; tepi kiri rata dengan judul. */}
      {showActualResult && (
        <div
          style={{
            margin: "10px 0 2px 132px",
            padding: "10px 14px",
            background: "#FFFBFB",
            border: "1px solid #FBE1E1",
            borderRadius: 10,
            display: "flex",
            alignItems: "flex-start",
            gap: 16,
          }}
        >
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#991B1B" }}>Actual Result</span>
            <span style={{ fontSize: 13, lineHeight: 1.55, color: "#334155", whiteSpace: "pre-wrap" }}>
              {item.actualResult}
            </span>
          </div>
          {(attachedBugs.length > 0 || canCreateBug) && (
            <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: 6 }}>
              {renderBugLinks()}
            </div>
          )}
        </div>
      )}

      {/* Kalau box Actual Result tidak tampil, link bug tetap muncul. */}
      {!showActualResult && (attachedBugs.length > 0 || canCreateBug) && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 8 }}>
          {renderBugLinks()}
        </div>
      )}
    </div>
  );
}
