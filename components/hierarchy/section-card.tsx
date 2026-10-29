"use client";

import { useState } from "react";
import { ChevronDown, CirclePlus, FolderInput, GripVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { PrimaryButton, smallPrimaryButtonStyle } from "@/components/ui/button";
import { RowActionsMenu } from "@/components/settings/row-actions-menu";
import { TestCaseTable } from "./test-case-table";
import { type Section, type TestCase } from "./test-cases-shared";

export function SectionCard({
  section,
  tcs,
  canEdit,
  addingTc,
  editingTcId,
  draggingTcId,
  onToggle,
  onDelete,
  onRename,
  onAddCase,
  onEdit,
  onDeleteTc,
  onDropTc,
  onMoveTc,
  onMoveSection,
  draggingSectionId,
  sectionDragOver,
  onSectionDragStart,
  onSectionDragEnd,
  onSectionDragOver,
  onSectionDrop,
  onDragTcStart,
  onDragTcEnd,
  onOpenDetail,
  selectedTcIds,
  onToggleTc,
  onToggleAll,
  onLinkAutomation,
  onEditAutomation,
  onUnlinkAutomation,
  onQuickUpdate,
}: {
  section: Section;
  tcs: TestCase[];
  canEdit: boolean;
  addingTc: boolean;
  editingTcId: string | null;
  draggingTcId: string | null;
  onToggle: () => void;
  onDelete: () => void;
  onRename: (title: string) => void;
  onAddCase: () => void;
  onEdit: (t: TestCase) => void;
  onDeleteTc: (t: TestCase) => void;
  onDropTc: (tcId: string) => void;
  onMoveTc: (t: TestCase) => void;
  /** Buka modal "Pindahkan Section ini" (pindah section ke suite lain). */
  onMoveSection: () => void;
  /** Section yang sedang di-drag — null berarti tidak ada drag section aktif. */
  draggingSectionId?: string | null;
  /** Section ini jadi sasaran drop (sorot). */
  sectionDragOver?: boolean;
  onSectionDragStart?: () => void;
  onSectionDragEnd?: () => void;
  onSectionDragOver?: () => void;
  onSectionDrop?: () => void;
  onDragTcStart?: (tcId: string) => void;
  onDragTcEnd?: () => void;
  onOpenDetail: (t: TestCase) => void;
  selectedTcIds: Set<string>;
  onToggleTc: (tcId: string) => void;
  onToggleAll: (tcList: TestCase[]) => void;
  /** Aksi automation dari kolom Automation / menu Opsi (opsional). */
  onLinkAutomation?: (t: TestCase) => void;
  onEditAutomation?: (t: TestCase) => void;
  onUnlinkAutomation?: (t: TestCase) => void;
  onQuickUpdate: (
    t: TestCase,
    data: {
      priority?: TestCase["priority"];
      status?: TestCase["status"];
      type?: TestCase["type"];
    }
  ) => void;
}) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(section.name);
  const [dragOver, setDragOver] = useState(false);

  const commitTitle = () => {
    const t = titleDraft.trim();
    if (t && t !== section.name) onRename(t);
    setEditingTitle(false);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (draggingTcId) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (draggingTcId) onDropTc(draggingTcId);
      }}
      style={{
        // mb-2: jarak antar accordion section dipadatkan (16 -> 8px).
        marginBottom: "0.5rem",
        background: dragOver ? "rgba(251, 191, 36, 0.05)" : "#fff",
        border: dragOver ? "1px solid #FBBF24" : "1px solid var(--border)",
        borderRadius: 8,
        overflow: "hidden",
        transition: "background 0.15s ease, border-color 0.15s ease",
        boxShadow: dragOver ? "0 0 0 2px rgba(251, 191, 36, 0.25)" : "none",
      }}
    >
      {/* Section header — klik di area mana pun = expand/collapse */}
      <div
        onClick={onToggle}
        onDragOver={(e) => {
          // Hanya berlaku saat ada SECTION yang sedang di-drag; kalau yang
          // di-drag TC, event dibiarkan naik ke handler drop TC di kartu.
          if (!draggingSectionId) return;
          e.preventDefault();
          e.stopPropagation();
          onSectionDragOver?.();
        }}
        onDrop={(e) => {
          if (!draggingSectionId) return;
          e.preventDefault();
          e.stopPropagation();
          onSectionDrop?.();
        }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          // Padding vertikal 10px: tombol "Tambah Case" varian kecil (32px),
          // jadi header sedikit lebih lega.
          padding: "10px 0.9rem",
          background: sectionDragOver ? "rgba(251, 191, 36, 0.12)" : "var(--surface-muted)",
          borderBottom: section.open ? "1px solid var(--border)" : "none",
          cursor: "pointer",
          userSelect: "none",
          transition: "background 0.15s ease",
        }}
      >
        {/* Select All dipindah ke sub-header tabel (kolom kiri `TC ID`) */}

        {/* Handle drag: menariknya menyusun ulang urutan section. */}
        {canEdit && (
          <span
            role="button"
            aria-label={`Ubah urutan section ${section.name}`}
            title="Tarik untuk mengubah urutan section"
            draggable
            onClick={(e) => e.stopPropagation()}
            onDragStart={(e) => {
              e.stopPropagation();
              e.dataTransfer.effectAllowed = "move";
              onSectionDragStart?.();
            }}
            onDragEnd={(e) => {
              e.stopPropagation();
              onSectionDragEnd?.();
            }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              color: "#94A3B8",
              cursor: "grab",
              flexShrink: 0,
            }}
          >
            <GripVertical size={15} aria-hidden="true" />
          </span>
        )}

        {/* Chevron di sebelah kiri nama section: rotasi halus saat open/close */}
        <button
          type="button"
          aria-expanded={section.open}
          aria-label={
            section.open ? `Tutup section ${section.name}` : `Buka section ${section.name}`
          }
          title={section.open ? "Tutup section" : "Buka section"}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 0,
            border: "none",
            background: "transparent",
            color: "#6B7280",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <ChevronDown
            size={16}
            aria-hidden="true"
            style={{
              transform: section.open ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.2s ease",
            }}
          />
        </button>

        {/* Editable section title */}
        {editingTitle ? (
          <input
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitTitle();
              if (e.key === "Escape") setEditingTitle(false);
            }}
            autoFocus
            onClick={(e) => e.stopPropagation()}
            style={{
              border: "1px solid #F59E0B",
              padding: "0.2rem 0.4rem",
              fontSize: "0.9rem",
              fontWeight: 600,
              borderRadius: 3,
              outline: "none",
              minWidth: 180,
            }}
          />
        ) : (
          <span
            onClick={(e) => {
              // Klik nama = ubah nama, bukan expand/collapse.
              e.stopPropagation();
              setTitleDraft(section.name);
              setEditingTitle(true);
            }}
            title="Klik untuk mengubah nama section"
            style={{
              fontWeight: 600,
              fontSize: "0.9rem",
              color: "var(--text)",
              cursor: canEdit ? "text" : "default",
              padding: "0.1rem 0.15rem",
              borderRadius: 3,
            }}
          >
            {section.name}
          </span>
        )}

        {/* Counter plain text: inline di samping nama section */}
        <span
          style={{
            fontSize: 13,
            fontWeight: 400,
            color: "#6B7280",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          ({tcs.length} Test Case{tcs.length === 1 ? "" : "s"})
        </span>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          {canEdit && !addingTc && editingTcId === null && (
            <PrimaryButton
              style={smallPrimaryButtonStyle}
              onClick={(e) => {
                e.stopPropagation();
                onAddCase();
              }}
            >
              <Plus size={12} strokeWidth={2.6} /> Tambah Case
            </PrimaryButton>
          )}
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 64,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              flexShrink: 0,
            }}
          >
            <RowActionsMenu
              actions={[
                {
                  label: "Edit Nama Section",
                  icon: <Pencil size={15} />,
                  onClick: () => {
                    setTitleDraft(section.name);
                    setEditingTitle(true);
                  },
                },
                {
                  label: "Pindahkan Section ini",
                  icon: <FolderInput size={15} />,
                  onClick: onMoveSection,
                },
                {
                  label: "Hapus Section",
                  icon: <Trash2 size={15} />,
                  onClick: onDelete,
                  destructive: true,
                },
              ]}
            />
          </div>
          {/* Chevron sudah dipindah ke sebelah kiri nama section */}
        </div>
      </div>

      {/* Section body */}
      {section.open && (
        <div style={{ padding: "0.75rem" }}>
          {tcs.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "1.5rem 1rem",
                border: "2px dashed var(--border)",
                borderRadius: 8,
              }}
            >
              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", margin: "0 0 0.5rem" }}>
                Belum ada test case di section ini.
              </p>
              {canEdit && (
                <button
                  type="button"
                  onClick={onAddCase}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.3rem",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    color: "#000000",
                    background: "#F59E0B",
                    border: "none",
                    padding: "6px 12px",
                    borderRadius: 3,
                    cursor: "pointer",
                  }}
                >
                  <CirclePlus size={14} /> Tambah Test Case Pertama
                </button>
              )}
            </div>
          ) : (
            <TestCaseTable
              testCases={tcs}
              onEdit={onEdit}
              onDelete={onDeleteTc}
              canEdit={canEdit}
              onDragTcStart={onDragTcStart}
              onDragTcEnd={onDragTcEnd}
              onMoveTc={onMoveTc}
              onOpenDetail={onOpenDetail}
              selectedTcIds={selectedTcIds}
              onToggleTc={onToggleTc}
              onToggleAll={onToggleAll}
              onLinkAutomation={onLinkAutomation}
              onEditAutomation={onEditAutomation}
              onUnlinkAutomation={onUnlinkAutomation}
              onQuickUpdate={onQuickUpdate}
            />
          )}
        </div>
      )}
    </div>
  );
}
