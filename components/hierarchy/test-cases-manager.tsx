"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRefresh } from "@/lib/client/refresh-context";
import {
  AlertCircle,
  ChevronDown,
  CheckCircle2,
  ChevronRight,
  Download,
  FolderInput,
  History,
  Layers,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  createTestCase,
  deleteTestCase,
  quickUpdateTestCase,
  updateTestCase,
} from "@/lib/actions/test-cases";
import {
  assignTestCaseToSection,
  assignTestCasesToSection,
  createSection,
  deleteSection as deleteSectionAction,
  renameSection as renameSectionAction,
} from "@/lib/actions/sections";
import { RowActionsMenu } from "@/components/settings/row-actions-menu";
import { ConfirmDialog } from "@/components/ui/feedback";
import { shortTcId } from "@/lib/format";

export type TestCase = {
  id: string;
  tcId: string;
  title: string;
  scenario: string | null;
  precondition: string | null;
  steps: string | null;
  testData: string | null;
  expectedResult: string | null;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: "DRAFT" | "ACTIVE" | "DEPRECATED";
  sectionId: string | null;
  createdAt?: string | Date;
  createdBy?: { name: string | null } | null;
};

/** Section (dari DB) dengan state accordion lokal. */
type Section = {
  id: string;
  name: string;
  description?: string | null;
  open: boolean;
};

const priorityTone = (p: TestCase["priority"]) =>
  p === "CRITICAL" ? "danger" : p === "HIGH" ? "warning" : p === "MEDIUM" ? "info" : "neutral";
const statusTone = (s: TestCase["status"]) =>
  s === "ACTIVE" ? "success" : s === "DEPRECATED" ? "neutral" : "warning";

const badgeStyle = (tone: string): React.CSSProperties => ({
  display: "inline-block",
  padding: "0.15rem 0.5rem",
  borderRadius: 999,
  fontSize: "0.72rem",
  fontWeight: 600,
  ...(tone === "danger" && { background: "var(--danger-bg)", color: "var(--danger)" }),
  ...(tone === "warning" && { background: "var(--warning-bg)", color: "#B45309" }),
  ...(tone === "info" && { background: "var(--info-bg)", color: "var(--info)" }),
  ...(tone === "success" && { background: "var(--success-bg)", color: "var(--success)" }),
  ...(tone === "neutral" && { background: "var(--surface-muted)", color: "var(--text-secondary)" }),
});

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.5rem 0.75rem",
  border: "1px solid var(--border-strong)",
  borderRadius: 8,
  fontSize: "0.875rem",
  color: "var(--text)",
  background: "#fff",
};

const btnYellow: React.CSSProperties = {
  padding: "0.5rem 1.25rem",
  borderRadius: 8,
  border: "none",
  background: "#FFB622",
  color: "#1F2937",
  fontWeight: 700,
  fontSize: "0.85rem",
  cursor: "pointer",
};

const btnGhost: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.3rem",
  padding: "0.5rem 0.9rem",
  borderRadius: 8,
  border: "1px solid var(--border-strong)",
  background: "#fff",
  color: "var(--text-secondary)",
  fontWeight: 600,
  fontSize: "0.82rem",
  cursor: "pointer",
};

/** Button sekunder standar untuk toolbar header (height 38px, radius 8px, border #E5E7EB). */
const btnHeader: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "0.35rem",
  height: 38,
  padding: "8px 14px",
  borderRadius: 8,
  border: "1px solid #E5E7EB",
  background: "#fff",
  color: "#111827",
  fontWeight: 600,
  fontSize: "0.82rem",
  cursor: "pointer",
};

function TestCaseForm({
  title,
  suiteName,
  suiteId,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  title: string;
  suiteName?: string;
  suiteId: string;
  initial?: TestCase;
  submitLabel: string;
  onSubmit: (formData: FormData) => Promise<{ error?: string; success?: boolean }>;
  onCancel: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ title?: string; scenario?: string }>({});
  const [isPending, setIsPending] = useState(false);
  const [titleValue, setTitleValue] = useState(initial?.title ?? "");
  const [scenarioValue, setScenarioValue] = useState(initial?.scenario ?? "");
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const title = titleValue.trim();
    const scenario = scenarioValue.trim();

    setFieldErrors({});
    setError(null);

    const errors: { title?: string; scenario?: string } = {};
    if (!title) errors.title = "Judul test case wajib diisi.";
    if (!scenario) errors.scenario = "Detail skenario wajib diisi.";
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setIsPending(true);
    try {
      formData.set("title", title);
      formData.set("scenario", scenario);
      formData.set("suiteId", suiteId);
      const res = await onSubmit(formData);
      if (res?.error) setError(res.error);
      else if (res?.success) onCancel();
    } finally {
      setIsPending(false);
    }
  };

  const errorBorder: React.CSSProperties = {
    border: "1px solid #EF4444",
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        background: "rgba(0, 0, 0, 0.5)",
        backdropFilter: "blur(4px)",
      }}
      onClick={onCancel}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 720,
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          background: "#ffffff",
          borderRadius: 16,
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          overflow: "hidden",
          animation: "modalIn 0.18s ease-out",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "1rem 1.25rem",
            borderBottom: "1px solid var(--border)",
            flexShrink: 0,
          }}
        >
          <div>
            <h3 style={{ fontSize: "1.05rem", fontWeight: 700, margin: 0 }}>{title}</h3>
            {suiteName && (
              <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: "0.15rem 0 0" }}>
                Suite: <strong style={{ fontWeight: 600 }}>{suiteName}</strong>
              </p>
            )}
          </div>
          <button
            type="button"
            aria-label="Tutup"
            onClick={onCancel}
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              border: "none",
              background: "transparent",
              color: "var(--text-secondary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--surface-muted)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            <X size={17} />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
            padding: "1.25rem",
            overflowY: "auto",
          }}
        >
          {/* Row 1: TC ID | Status | Priority (2-col grid) */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              <label
                style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)" }}
              >
                TC ID (otomatis, bisa diubah)
              </label>
              <input
                name="tcId"
                placeholder="Auto-generate"
                defaultValue={initial?.tcId ?? ""}
                style={inputStyle}
              />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                <label
                  style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)" }}
                >
                  Priority
                </label>
                <select
                  name="priority"
                  defaultValue={initial?.priority ?? "MEDIUM"}
                  style={inputStyle}
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="CRITICAL">Critical</option>
                </select>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                <label
                  style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)" }}
                >
                  Status
                </label>
                <select name="status" defaultValue={initial?.status ?? "DRAFT"} style={inputStyle}>
                  <option value="DRAFT">Draft</option>
                  <option value="ACTIVE">Active</option>
                  <option value="DEPRECATED">Deprecated</option>
                </select>
              </div>
            </div>
          </div>

          {/* Row 2: Title (full width) */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)" }}>
              Title <span style={{ color: "#EF4444" }}>*</span>
            </label>
            <input
              ref={titleRef}
              name="title"
              placeholder="Judul test case"
              value={titleValue}
              required
              style={fieldErrors.title ? { ...inputStyle, ...errorBorder } : inputStyle}
              onChange={(e) => {
                setTitleValue(e.target.value);
                if (fieldErrors.title) setFieldErrors((prev) => ({ ...prev, title: undefined }));
              }}
            />
            {fieldErrors.title && (
              <p style={{ color: "#EF4444", fontSize: "0.8rem", margin: 0 }}>{fieldErrors.title}</p>
            )}
          </div>

          {/* Row 3: Detail Skenario (full width) */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            <label style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)" }}>
              Detail Skenario <span style={{ color: "#EF4444" }}>*</span>
            </label>
            <textarea
              name="scenario"
              rows={2}
              value={scenarioValue}
              required
              style={fieldErrors.scenario ? { ...inputStyle, ...errorBorder } : inputStyle}
              onChange={(e) => {
                setScenarioValue(e.target.value);
                if (fieldErrors.scenario)
                  setFieldErrors((prev) => ({ ...prev, scenario: undefined }));
              }}
            />
            {fieldErrors.scenario && (
              <p style={{ color: "#EF4444", fontSize: "0.8rem", margin: 0 }}>
                {fieldErrors.scenario}
              </p>
            )}
          </div>

          {/* Execution Details: grouped shaded block */}
          <div
            style={{
              background: "var(--surface-muted)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: "0.85rem 0.9rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.7rem",
            }}
          >
            <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text-secondary)" }}>
              Execution Details
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              <label
                style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)" }}
              >
                Precondition
              </label>
              <textarea
                name="precondition"
                rows={2}
                defaultValue={initial?.precondition ?? ""}
                style={inputStyle}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              <label
                style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)" }}
              >
                Steps
              </label>
              <textarea
                name="steps"
                rows={4}
                defaultValue={initial?.steps ?? ""}
                style={inputStyle}
              />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                <label
                  style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)" }}
                >
                  Test Data
                </label>
                <textarea
                  name="testData"
                  rows={2}
                  defaultValue={initial?.testData ?? ""}
                  style={inputStyle}
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                <label
                  style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-secondary)" }}
                >
                  Expected Result
                </label>
                <textarea
                  name="expectedResult"
                  rows={3}
                  defaultValue={initial?.expectedResult ?? ""}
                  style={inputStyle}
                />
              </div>
            </div>
          </div>

          {error && <p style={{ color: "#b91c1c", fontSize: "0.85rem", margin: 0 }}>{error}</p>}

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "0.5rem",
              marginTop: "0.25rem",
              paddingTop: "1rem",
              borderTop: "1px solid var(--border)",
            }}
          >
            <button type="button" onClick={onCancel} disabled={isPending} style={btnGhost}>
              Batal
            </button>
            <button type="submit" disabled={isPending} style={{ ...btnYellow, fontWeight: 600 }}>
              {isPending ? "Menyimpan..." : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

function SectionCard({
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
  onDragTcStart,
  onDragTcEnd,
  onOpenDetail,
  selectedTcIds,
  onToggleTc,
  onToggleAll,
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
  onDragTcStart?: (tcId: string) => void;
  onDragTcEnd?: () => void;
  onOpenDetail: (t: TestCase) => void;
  selectedTcIds: Set<string>;
  onToggleTc: (tcId: string) => void;
  onToggleAll: (tcList: TestCase[]) => void;
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
        marginBottom: "1rem",
        background: dragOver ? "rgba(251, 191, 36, 0.05)" : "#fff",
        border: dragOver ? "1px solid #FBBF24" : "1px solid var(--border)",
        borderRadius: 8,
        overflow: "hidden",
        transition: "background 0.15s ease, border-color 0.15s ease",
        boxShadow: dragOver ? "0 0 0 2px rgba(251, 191, 36, 0.25)" : "none",
      }}
    >
      {/* Section header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          padding: "0.6rem 0.9rem",
          background: "var(--surface-muted)",
          borderBottom: section.open ? "1px solid var(--border)" : "none",
        }}
      >
        <button
          type="button"
          onClick={onToggle}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.35rem",
            border: "none",
            background: "transparent",
            color: "var(--text)",
            fontWeight: 600,
            fontSize: "0.9rem",
            cursor: "pointer",
            padding: 0,
          }}
        >
          {section.open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
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
            onClick={() => {
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
            <button
              type="button"
              onClick={onAddCase}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.25rem",
                fontSize: "0.78rem",
                fontWeight: 400,
                color: "#000000",
                background: "#F59E0B",
                padding: "0.35rem 0.65rem",
                borderRadius: 3,
                border: "none",
                cursor: "pointer",
                transition: "background-color 0.15s ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#D97706")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "#F59E0B")}
            >
              <Plus size={13} /> Tambah Case
            </button>
          )}
          <div
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
                  label: "Hapus Section",
                  icon: <Trash2 size={15} />,
                  onClick: onDelete,
                  destructive: true,
                },
              ]}
            />
          </div>
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
                    fontSize: "0.8rem",
                    fontWeight: 400,
                    color: "#000000",
                    background: "#F59E0B",
                    border: "none",
                    padding: "0.35rem 0.7rem",
                    borderRadius: 3,
                    cursor: "pointer",
                  }}
                >
                  + Tambah Test Case Pertama
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
            />
          )}
        </div>
      )}
    </div>
  );
}

function TestCaseTable({
  testCases,
  onEdit,
  onDelete,
  canEdit,
  onDragTcStart,
  onDragTcEnd,
  onMoveTc,
  onOpenDetail,
  selectedTcIds,
  onToggleTc,
  onToggleAll,
}: {
  testCases: TestCase[];
  onEdit: (t: TestCase) => void;
  onDelete: (t: TestCase) => void;
  canEdit: boolean;
  onDragTcStart?: (tcId: string) => void;
  onDragTcEnd?: () => void;
  onMoveTc?: (t: TestCase) => void;
  onOpenDetail?: (t: TestCase) => void;
  selectedTcIds?: Set<string>;
  onToggleTc?: (tcId: string) => void;
  onToggleAll?: (tcList: TestCase[]) => void;
}) {
  const refresh = useRefresh();
  if (testCases.length === 0) {
    return (
      <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", margin: "0.25rem 0" }}>
        Belum ada test case di suite ini.
      </p>
    );
  }

  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: "0.85rem",
          tableLayout: "fixed",
        }}
      >
        <thead>
          <tr
            style={{
              color: "var(--text-muted)",
              textAlign: "left",
              borderBottom: "1px solid var(--border)",
            }}
          >
            {canEdit && onToggleTc && (
              <th style={{ padding: "0.5rem 0.4rem", width: 40, textAlign: "center" }}>
                {onToggleAll && (
                  <input
                    type="checkbox"
                    checked={
                      testCases.length > 0 && testCases.every((t) => selectedTcIds?.has(t.id))
                    }
                    ref={(el) => {
                      if (el) {
                        const some = testCases.some((t) => selectedTcIds?.has(t.id));
                        el.indeterminate =
                          some && !testCases.every((t) => selectedTcIds?.has(t.id));
                      }
                    }}
                    onChange={() => onToggleAll(testCases)}
                    title="Pilih semua test case di section ini"
                    style={{ cursor: "pointer" }}
                  />
                )}
              </th>
            )}
            <th style={{ padding: "0.5rem 1rem", fontWeight: 600, width: 220 }}>TC ID</th>
            <th style={{ padding: "0.5rem 0.5rem", fontWeight: 600, width: "auto" }}>Title</th>
            <th style={{ padding: "0.5rem 0.5rem", fontWeight: 600, width: 140 }}>Priority</th>
            <th style={{ padding: "0.5rem 0.5rem", fontWeight: 600, width: 140 }}>Status</th>
            {canEdit && (
              <th
                style={{
                  padding: "0.5rem 0.5rem",
                  fontWeight: 600,
                  textAlign: "center",
                  width: 60,
                }}
              >
                Opsi
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {testCases.map((t) => (
            <tr
              key={t.id}
              draggable={canEdit && !!onDragTcStart}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "move";
                // Ghost preview: tampilkan jumlah item saat bulk drag
                if (selectedTcIds && selectedTcIds.size > 0 && selectedTcIds.has(t.id)) {
                  const ghost = document.createElement("div");
                  ghost.textContent = `Moving ${selectedTcIds.size} Test Cases`;
                  ghost.style.cssText =
                    "position:fixed;top:-1000px;padding:6px 12px;border-radius:8px;background:#F59E0B;color:#0F172A;font-weight:700;font-size:12px;font-family:inherit;box-shadow:0 4px 12px rgba(0,0,0,0.15);z-index:9999;";
                  document.body.appendChild(ghost);
                  e.dataTransfer.setDragImage(ghost, 12, 12);
                  setTimeout(() => ghost.remove(), 0);
                }
                onDragTcStart?.(t.id);
              }}
              onDragEnd={() => onDragTcEnd?.()}
              style={{
                borderBottom: "1px solid var(--border)",
                transition: "background 0.15s ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-muted)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              {canEdit && onToggleTc && (
                <td style={{ padding: "0.4rem 0.4rem", width: 40, textAlign: "center" }}>
                  <input
                    type="checkbox"
                    checked={selectedTcIds?.has(t.id) ?? false}
                    onChange={() => onToggleTc?.(t.id)}
                    title="Pilih test case"
                    style={{ cursor: "pointer" }}
                  />
                </td>
              )}
              <td
                style={{
                  padding: "0.5rem 1rem",
                  whiteSpace: "nowrap",
                  width: 220,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                <button
                  type="button"
                  onClick={() => onOpenDetail?.(t)}
                  title={`${t.tcId} — Lihat detail test case`}
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.78rem",
                    fontWeight: 500,
                    color: "#1D4ED8",
                    background: "none",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    textDecoration: "none",
                    transition: "color 0.15s ease, text-decoration 0.15s ease",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
                  onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
                >
                  {shortTcId(t.tcId)}
                </button>
              </td>
              <td
                style={{
                  padding: "0.5rem 0.5rem",
                  width: "auto",
                  fontWeight: 600,
                  color: "var(--text)",
                  fontSize: "0.85rem",
                  userSelect: "text",
                  cursor: "default",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {t.title}
              </td>
              <td style={{ padding: "0.5rem 0.5rem", width: 140 }}>
                <select
                  value={t.priority}
                  disabled={!canEdit}
                  onChange={async (e) => {
                    const val = e.target.value as TestCase["priority"];
                    const res = await quickUpdateTestCase(t.id, { priority: val });
                    if (res.success) refresh();
                  }}
                  style={{
                    ...badgeStyle(priorityTone(t.priority)),
                    border: "none",
                    cursor: canEdit ? "pointer" : "default",
                    outline: "none",
                    maxWidth: "100%",
                  }}
                >
                  <option value="CRITICAL">CRITICAL</option>
                  <option value="HIGH">HIGH</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="LOW">LOW</option>
                </select>
              </td>
              <td style={{ padding: "0.5rem 0.5rem", width: 140 }}>
                <select
                  value={t.status}
                  disabled={!canEdit}
                  onChange={async (e) => {
                    const val = e.target.value as TestCase["status"];
                    const res = await quickUpdateTestCase(t.id, { status: val });
                    if (res.success) refresh();
                  }}
                  style={{
                    ...badgeStyle(statusTone(t.status)),
                    border: "none",
                    cursor: canEdit ? "pointer" : "default",
                    outline: "none",
                    maxWidth: "100%",
                  }}
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="DRAFT">DRAFT</option>
                  <option value="DEPRECATED">DEPRECATED</option>
                </select>
              </td>
              {canEdit && (
                <td style={{ padding: "0.5rem 0.5rem", textAlign: "center", width: 60 }}>
                  <div style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
                    <RowActionsMenu
                      actions={[
                        ...(onMoveTc
                          ? [
                              {
                                label: "Pindah Section",
                                icon: <FolderInput size={15} />,
                                onClick: () => onMoveTc?.(t),
                              },
                            ]
                          : []),
                        {
                          label: "Edit",
                          icon: <Pencil size={15} />,
                          onClick: () => onEdit(t),
                        },
                        {
                          label: "Hapus",
                          icon: <Trash2 size={15} />,
                          onClick: () => onDelete(t),
                          destructive: true,
                        },
                      ]}
                    />
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TestCasesManager({
  suiteId,
  suiteName,
  testCases,
  sections = [],
  canEdit = true,
  initialEditTcId = null,
}: {
  suiteId: string;
  suiteName: string;
  testCases: TestCase[];
  sections?: { id: string; name: string; description: string | null }[];
  canEdit?: boolean;
  initialEditTcId?: string | null;
}) {
  const refresh = useRefresh();
  // Cermin lokal daftar test case: mutasi add/delete di-update in-place di
  // state ini (tanpa refresh satu halaman penuh), disinkronkan ulang dari
  // prop saat parent me-refetch (prop server otoritatif).
  const [localTestCases, setLocalTestCases] = useState<TestCase[]>(testCases);
  useEffect(() => {
    setLocalTestCases(testCases);
  }, [testCases]);
  // Anchor untuk toolbar di header halaman (diisi via useEffect setelah mount)
  const [headerAnchor, setHeaderAnchor] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const el = document.getElementById("suite-header-actions");
    setHeaderAnchor(el);
  }, []);
  const [addingTc, setAddingTc] = useState(false);
  const [editingTcId, setEditingTcId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Deep-link ?edit=<tcId>: buka modal edit Test Case langsung saat mount
  useEffect(() => {
    if (initialEditTcId && localTestCases.some((t) => t.id === initialEditTcId)) {
      setEditingTcId(initialEditTcId);
    }
  }, [initialEditTcId, testCases]);

  // --- Section state (persist ke DB via server actions) ---
  const [showAddSection, setShowAddSection] = useState(false);
  const [sectionTitle, setSectionTitle] = useState("");
  const [sectionDesc, setSectionDesc] = useState("");
  // Section yang sedang menerima TC baru (klik "+ Tambah Case" di header section)
  const [addingTcFor, setAddingTcFor] = useState<string | null>(null);
  // Accordion state per section (session-only, tidak persist)
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  // Drag & drop pindah TC antar section
  const [draggingTcId, setDraggingTcId] = useState<string | null>(null);
  // Bulk drag: section tujuan saat drag sedang berlangsung
  const [bulkDropTarget, setBulkDropTarget] = useState<string | null>(null);
  // Bulk move sedang diproses
  const [bulkMoving, setBulkMoving] = useState(false);
  // Modal "Pindah Section" via menu
  const [moveModalTc, setMoveModalTc] = useState<TestCase | null>(null);
  // Modal detail test case (klik TC ID / title)
  const [detailTc, setDetailTc] = useState<TestCase | null>(null);
  // Modal konfirmasi hapus test case
  const [deleteTcTarget, setDeleteTcTarget] = useState<TestCase | null>(null);
  // Modal konfirmasi hapus section
  const [sectionDeleteTarget, setSectionDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  // Bulk selection test case
  const [selectedTcIds, setSelectedTcIds] = useState<Set<string>>(new Set());
  // Modal bulk move (pilih section tujuan)
  const [bulkMoveOpen, setBulkMoveOpen] = useState(false);
  // Modal konfirmasi hapus bulk
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  // Jumlah TC yang dihapus via bulk (disimpan agar label konsisten saat success)
  const [bulkDeleteCount, setBulkDeleteCount] = useState(0);
  // Toast notification
  const [toast, setToast] = useState<{ show: boolean; message: string; type: "success" | "error" }>(
    {
      show: false,
      message: "",
      type: "success",
    }
  );
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Progress bulk import
  const [upload, setUpload] = useState<{
    open: boolean;
    status: "processing" | "success" | "error";
    total: number;
    processed: number;
    failedRows: number[];
  }>({ open: false, status: "processing", total: 0, processed: 0, failedRows: [] });

  // Wizard import: Step 1 (file dipilih) -> Step 2 (preview & mapping)
  const [importPreview, setImportPreview] = useState<{
    step: 1 | 2;
    fileName: string;
    headers: string[];
    rows: Record<string, string>[];
  } | null>(null);

  const showToast = (message: string, type: "success" | "error") => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ show: true, message, type });
    toastTimer.current = setTimeout(() => {
      setToast({ show: false, message: "", type: "success" });
    }, 4000);
  };

  const editingTc = localTestCases.find((t) => t.id === editingTcId) ?? null;

  const isOpen = (id: string) => openSections[id] ?? true;

  const moveTc = async (tcId: string, sectionId: string | null) => {
    const res = await assignTestCaseToSection(tcId, sectionId);
    if (res.success) refresh();
  };

  /** Drop handler: pindahkan 1 TC (drag biasa) atau semua TC terpilih (bulk drag). */
  const handleDropTc = async (tcId: string, sectionId: string | null, sectionName: string) => {
    const isBulk = selectedTcIds.size > 0 && selectedTcIds.has(tcId);
    const targetIds = isBulk ? Array.from(selectedTcIds) : [tcId];
    setBulkMoving(true);
    try {
      const res = isBulk
        ? await assignTestCasesToSection(targetIds, sectionId)
        : await assignTestCaseToSection(tcId, sectionId);
      if (res.error) {
        showToast(res.error, "error");
        return;
      }
      if (isBulk) clearSelection();
      refresh();
      showToast(
        isBulk
          ? `${targetIds.length} Test Cases berhasil dipindahkan ke ${sectionName}`
          : "Test Case dipindahkan.",
        "success"
      );
    } catch {
      showToast("Gagal memindahkan test case. Coba lagi", "error");
    } finally {
      setBulkMoving(false);
    }
  };

  const addSection = async () => {
    const title = sectionTitle.trim();
    if (!title) return;
    const res = await createSection(suiteId, { name: title, description: sectionDesc });
    if (res.success) {
      setSectionTitle("");
      setSectionDesc("");
      setShowAddSection(false);
      refresh();
    }
  };

  const toggleSection = (id: string) => {
    setOpenSections((prev) => ({ ...prev, [id]: !(prev[id] ?? true) }));
  };

  const deleteSection = async (id: string) => {
    const res = await deleteSectionAction(id);
    if (res.success) refresh();
  };

  const renameSection = async (id: string, title: string) => {
    await renameSectionAction(id, title);
    refresh();
  };

  // --- Bulk selection helpers ---
  const toggleTcSelection = (tcId: string) => {
    setSelectedTcIds((prev) => {
      const next = new Set(prev);
      if (next.has(tcId)) next.delete(tcId);
      else next.add(tcId);
      return next;
    });
  };

  const toggleAllInList = (tcList: TestCase[]) => {
    setSelectedTcIds((prev) => {
      const next = new Set(prev);
      const allSelected = tcList.every((t) => next.has(t.id));
      if (allSelected) {
        tcList.forEach((t) => next.delete(t.id));
      } else {
        tcList.forEach((t) => next.add(t.id));
      }
      return next;
    });
  };

  const clearSelection = () => setSelectedTcIds(new Set());

  const bulkMove = async (sectionId: string | null) => {
    for (const tcId of Array.from(selectedTcIds)) {
      await assignTestCaseToSection(tcId, sectionId);
    }
    clearSelection();
    setBulkMoveOpen(false);
    refresh();
    showToast(`${selectedTcIds.size} Test Case dipindahkan!`, "success");
  };

  const bulkDelete = async () => {
    for (const tcId of Array.from(selectedTcIds)) {
      const fd = new FormData();
      fd.set("id", tcId);
      await deleteTestCase(fd);
    }
    const count = selectedTcIds.size;
    clearSelection();
    refresh();
    showToast(`${count} Test Case dihapus!`, "success");
  };

  // Grouping TC per section (dari DB sectionId) + unassigned
  const grouped: {
    section: { id: string; name: string; description: string | null };
    tcs: TestCase[];
  }[] = sections.map((s) => ({
    section: s,
    tcs: localTestCases.filter((t) => t.sectionId === s.id),
  }));
  const unassigned = localTestCases.filter((t) => !t.sectionId);

  const handleDeleteTC = async (t: TestCase) => {
    const fd = new FormData();
    fd.set("id", t.id);
    await deleteTestCase(fd);
    setLocalTestCases((prev) => prev.filter((tc) => tc.id !== t.id));
    setSelectedTcIds((prev) => {
      const next = new Set(prev);
      next.delete(t.id);
      return next;
    });
    showToast("Test Case dihapus.", "success");
  };

  const handleExport = async (format: "csv" | "xlsx") => {
    const rows = localTestCases.map((t) => ({
      tcId: t.tcId,
      title: t.title,
      scenario: t.scenario ?? "",
      precondition: t.precondition ?? "",
      steps: t.steps ?? "",
      testData: t.testData ?? "",
      expectedResult: t.expectedResult ?? "",
      priority: t.priority,
      status: t.status,
    }));
    const fileName = `test-cases-${suiteName.replace(/\s+/g, "-").toLowerCase()}`;
    if (format === "csv") {
      const Papa = (await import("papaparse")).default;
      const csv = Papa.unparse(rows);
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${fileName}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      const XLSX = await import("xlsx");
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Test Cases");
      XLSX.writeFile(wb, `${fileName}.xlsx`);
    }
  };

  const handleDownloadTemplate = () => {
    const header = [
      "title",
      "tcId",
      "scenario",
      "precondition",
      "steps",
      "testData",
      "expectedResult",
      "priority",
      "status",
    ];
    const example = [
      "Login berhasil dengan kredensial valid",
      "",
      "User membuka halaman login dan memasukkan email + password yang benar",
      "User memiliki akun aktif dan koneksi internet",
      "Buka halaman login\nMasukkan email valid\nKlik tombol Masuk",
      "email: user@example.com",
      "User masuk ke dashboard utama",
      "HIGH",
      "ACTIVE",
    ];
    // Escape nilai yang mengandung koma/quote/baris baru
    const escapeCsv = (v: string) => {
      if (/[",\n]/.test(v)) {
        return `"${v.replace(/"/g, '""')}"`;
      }
      return v;
    };
    const csv = [header.join(","), example.map(escapeCsv).join(",")].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "template-test-cases.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input supaya file yang sama bisa dipilih lagi
    e.target.value = "";
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const isCsv = file.name.toLowerCase().endsWith(".csv");
        let rows: Record<string, string>[];
        if (isCsv) {
          // CSV: baca sebagai teks UTF-8 (readAsBinaryString merusak encoding non-ASCII)
          const text = reader.result as string;
          // Hapus BOM (\uFEFF) dari awal file agar header pertama tidak terkontaminasi
          const cleanText = text.replace(/^\uFEFF/, "");
          const Papa = (await import("papaparse")).default;
          rows = Papa.parse<Record<string, string>>(cleanText, {
            header: true,
            skipEmptyLines: true,
          }).data;
        } else {
          const XLSX = await import("xlsx");
          const wb = XLSX.read(reader.result as string, { type: "binary" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: "" });
        }

        if (rows.length === 0) {
          showToast("File tidak berisi data.", "error");
          return;
        }

        // Simpan header asli + data mentah. Step 1: konfirmasi file -> Step 2: mapping.
        setImportPreview({ step: 1, fileName: file.name, headers: Object.keys(rows[0]), rows });
      } catch (err) {
        console.error(err);
        showToast("Gagal membaca file. Pastikan format sesuai template.", "error");
      }
    };
    if (file.name.toLowerCase().endsWith(".csv")) {
      reader.readAsText(file);
    } else {
      reader.readAsBinaryString(file);
    }
  };

  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Toolbar aksi dirender di header halaman (via portal ke #suite-header-actions) */}
      {headerAnchor &&
        canEdit &&
        createPortal(
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx"
              style={{ display: "none" }}
              onChange={handleImportFile}
            />
            <button type="button" onClick={handleDownloadTemplate} style={btnHeader}>
              <Download size={16} /> Template
            </button>
            <button type="button" onClick={() => fileRef.current?.click()} style={btnHeader}>
              <Upload size={16} /> Import
            </button>
            <button type="button" onClick={() => handleExport("csv")} style={btnHeader}>
              <Download size={16} /> CSV
            </button>
            {!showAddSection && (
              <button
                type="button"
                onClick={() => setShowAddSection(true)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.35rem",
                  height: 38,
                  padding: "8px 14px",
                  borderRadius: 8,
                  border: "none",
                  background: "#F59E0B",
                  color: "#111827",
                  fontWeight: 600,
                  fontSize: "0.82rem",
                  cursor: "pointer",
                  transition: "background-color 0.15s ease",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#D97706")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "#F59E0B")}
              >
                <Plus size={16} /> Tambah Section
              </button>
            )}
          </div>,
          headerAnchor
        )}

      <div
        style={{
          width: "100%",
          background: "#ffffff",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-md)",
        }}
      >
        <div style={{ padding: "1.25rem" }}>
          {addingTc && (
            <div style={{ padding: "0 0 1rem" }}>
              <TestCaseForm
                title="Tambah Test Case Baru"
                suiteName={suiteName}
                suiteId={suiteId}
                submitLabel="Simpan Test Case"
                onCancel={() => {
                  setAddingTc(false);
                  setAddingTcFor(null);
                }}
                onSubmit={async (fd) => {
                  if (addingTcFor) fd.set("sectionId", addingTcFor);
                  const res = await createTestCase(fd);
                  if (res.success) {
                    const created = res.testCase;
                    if (created) {
                      setLocalTestCases((prev) => [...prev, created]);
                      setOpenSections((prev) =>
                        created.sectionId ? { ...prev, [created.sectionId]: true } : prev
                      );
                    }
                    setAddingTc(false);
                    setAddingTcFor(null);
                  }
                  return res;
                }}
              />
            </div>
          )}

          {editingTc && (
            <div style={{ padding: "0 0 1rem" }}>
              <TestCaseForm
                key={editingTc.id}
                title="Edit Test Case"
                suiteName={suiteName}
                suiteId={suiteId}
                initial={editingTc}
                submitLabel="Simpan Perubahan"
                onCancel={() => setEditingTcId(null)}
                onSubmit={async (fd) => {
                  fd.set("id", editingTc.id);
                  const res = await updateTestCase(fd);
                  if (res.success) setEditingTcId(null);
                  return res;
                }}
              />
            </div>
          )}

          {/* Section cards + unassigned */}
          {grouped.map(({ section, tcs }) => (
            <SectionCard
              key={section.id}
              section={{ ...section, open: isOpen(section.id) }}
              tcs={tcs}
              canEdit={canEdit}
              addingTc={addingTc}
              editingTcId={editingTcId}
              draggingTcId={draggingTcId}
              onToggle={() => toggleSection(section.id)}
              onDelete={() => setSectionDeleteTarget({ id: section.id, name: section.name })}
              onRename={(title) => void renameSection(section.id, title)}
              onAddCase={() => {
                setAddingTcFor(section.id);
                setAddingTc(true);
              }}
              onEdit={(t) => setEditingTcId(t.id)}
              onDeleteTc={(t) => setDeleteTcTarget(t)}
              onDropTc={(tcId) => void handleDropTc(tcId, section.id, section.name)}
              onMoveTc={(t) => setMoveModalTc(t)}
              onDragTcStart={setDraggingTcId}
              onDragTcEnd={() => setDraggingTcId(null)}
              onOpenDetail={(t) => setDetailTc(t)}
              selectedTcIds={selectedTcIds}
              onToggleTc={toggleTcSelection}
              onToggleAll={(list) => toggleAllInList(list)}
            />
          ))}

          {/* Unassigned TC (belum masuk section mana pun) */}
          {unassigned.length > 0 && (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                if (draggingTcId) setBulkDropTarget("__none__");
              }}
              onDragLeave={() => setBulkDropTarget(null)}
              onDrop={(e) => {
                e.preventDefault();
                if (draggingTcId) {
                  void handleDropTc(draggingTcId, null, "Unassigned Test Cases");
                }
                setBulkDropTarget(null);
              }}
              style={{
                marginBottom: "1rem",
                background: bulkDropTarget === "__none__" ? "rgba(251, 191, 36, 0.05)" : "#fff",
                border:
                  bulkDropTarget === "__none__" ? "1px solid #FBBF24" : "1px solid var(--border)",
                borderRadius: 8,
                overflow: "hidden",
                transition: "background 0.15s ease, border-color 0.15s ease",
                boxShadow:
                  bulkDropTarget === "__none__" ? "0 0 0 2px rgba(251, 191, 36, 0.25)" : "none",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.6rem 0.9rem",
                  background: "var(--surface-muted)",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>Unassigned Test Cases</span>
                {/* Counter plain text */}
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 400,
                    color: "#6B7280",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                  }}
                >
                  ({unassigned.length} Test Case{unassigned.length === 1 ? "" : "s"})
                </span>
                <div
                  style={{
                    marginLeft: "auto",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  {canEdit && !addingTc && editingTcId === null && (
                    <button
                      type="button"
                      onClick={() => {
                        setAddingTcFor(null);
                        setAddingTc(true);
                      }}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.25rem",
                        fontSize: "0.78rem",
                        fontWeight: 400,
                        color: "#000000",
                        background: "#F59E0B",
                        padding: "0.35rem 0.65rem",
                        borderRadius: 3,
                        border: "none",
                        cursor: "pointer",
                      }}
                    >
                      <Plus size={13} /> Tambah Case
                    </button>
                  )}
                </div>
              </div>
              <div style={{ padding: "0.75rem" }}>
                <TestCaseTable
                  testCases={unassigned}
                  onEdit={(t) => setEditingTcId(t.id)}
                  onDelete={(t) => setDeleteTcTarget(t)}
                  canEdit={canEdit}
                  onDragTcStart={setDraggingTcId}
                  onDragTcEnd={() => setDraggingTcId(null)}
                  onMoveTc={(t) => setMoveModalTc(t)}
                  onOpenDetail={(t) => setDetailTc(t)}
                  selectedTcIds={selectedTcIds}
                  onToggleTc={toggleTcSelection}
                  onToggleAll={toggleAllInList}
                />
              </div>
            </div>
          )}

          {/* Empty state seluruh suite */}
          {localTestCases.length === 0 && sections.length === 0 && (
            <TestCaseTable
              testCases={[]}
              onEdit={(t) => setEditingTcId(t.id)}
              onDelete={(t) => setDeleteTcTarget(t)}
              canEdit={canEdit}
            />
          )}
        </div>
      </div>

      {/* Modal: Tambah Section Baru */}
      {showAddSection && (
        <AddSectionModal
          onClose={() => setShowAddSection(false)}
          onSave={addSection}
          sectionTitle={sectionTitle}
          setSectionTitle={setSectionTitle}
          sectionDesc={sectionDesc}
          setSectionDesc={setSectionDesc}
        />
      )}

      {/* Modal: Pindah Section */}
      {moveModalTc && (
        <MoveSectionModal
          tc={moveModalTc}
          sections={sections}
          onClose={() => setMoveModalTc(null)}
          onMove={async (sectionId: string | null) => {
            await moveTc(moveModalTc.id, sectionId);
            setMoveModalTc(null);
          }}
        />
      )}

      {/* Modal: Detail Test Case */}
      {detailTc && (
        <TestCaseDetailModal
          tc={detailTc}
          canEdit={canEdit}
          onClose={() => setDetailTc(null)}
          onEdit={() => {
            setEditingTcId(detailTc.id);
            setDetailTc(null);
          }}
        />
      )}

      {/* Modal: Konfirmasi Hapus Test Case */}
      {deleteTcTarget && (
        <DeleteTestCaseModal
          tcTitle={deleteTcTarget.title}
          onClose={() => setDeleteTcTarget(null)}
          onConfirm={() => handleDeleteTC(deleteTcTarget)}
        />
      )}

      {/* Modal: Wizard Import (Step 1: file, Step 2: preview & mapping) */}
      {importPreview && (
        <ImportWizardModal
          step={importPreview.step}
          fileName={importPreview.fileName}
          headers={importPreview.headers}
          rows={importPreview.rows}
          onClose={() => setImportPreview(null)}
          onProceedToPreview={() =>
            setImportPreview((prev) => (prev ? { ...prev, step: 2 } : prev))
          }
          onStartImport={async (mapping) => {
            // Tutup preview, buka modal progress, eksekusi dengan mapping
            setImportPreview(null);
            const mappedRows = importPreview.rows.map((r) => {
              const mapped: Record<string, string> = {};
              for (const [header, field] of Object.entries(mapping)) {
                if (field) mapped[field] = r[header] ?? "";
              }
              return mapped;
            });
            const validRows = mappedRows.filter((r) => (r.title ?? "").trim());
            if (validRows.length === 0) {
              showToast("Tidak ada baris valid (Title kosong).", "error");
              return;
            }
            setUpload({
              open: true,
              status: "processing",
              total: validRows.length,
              processed: 0,
              failedRows: [],
            });

            let created = 0;
            const failedRows: number[] = [];
            for (let i = 0; i < validRows.length; i++) {
              const r = validRows[i];
              try {
                const fd = new FormData();
                fd.set("suiteId", suiteId);
                fd.set("title", r.title ?? "");
                fd.set("tcId", r.tcId ?? "");
                fd.set("scenario", r.scenario ?? "");
                fd.set("precondition", r.precondition ?? "");
                fd.set("steps", r.steps ?? "");
                fd.set("testData", r.testData ?? "");
                fd.set("expectedResult", r.expectedResult ?? "");
                fd.set("priority", (r.priority ?? "MEDIUM").toUpperCase());
                fd.set("status", (r.status ?? "DRAFT").toUpperCase());
                const res = await createTestCase(fd);
                if (res.success) {
                  created++;
                } else {
                  failedRows.push(i + 1);
                }
              } catch {
                failedRows.push(i + 1);
              }
              setUpload((prev) => ({ ...prev, processed: i + 1 }));
            }

            refresh();
            if (created > 0) {
              setUpload((prev) => ({ ...prev, status: "success" }));
              showToast(`Berhasil mengimpor ${created} Test Case!`, "success");
            } else {
              setUpload((prev) => ({ ...prev, status: "error", failedRows }));
              showToast("Tidak ada test case yang berhasil diimpor.", "error");
            }
          }}
        />
      )}

      {/* Modal: Progress Bulk Import */}
      {upload.open && (
        <BulkUploadProgressModal
          upload={upload}
          onClose={() => setUpload((prev) => ({ ...prev, open: false }))}
        />
      )}

      {/* Modal: Bulk Move (pilih section) */}
      {bulkMoveOpen && (
        <BulkMoveModal
          sections={sections}
          onClose={() => setBulkMoveOpen(false)}
          onMove={async (sectionId: string | null) => {
            await bulkMove(sectionId);
          }}
        />
      )}

      {/* Modal: Bulk Delete confirm */}
      {bulkDeleteOpen && (
        <DeleteTestCaseModal
          tcTitle={`${bulkDeleteCount} test case terpilih`}
          onClose={() => setBulkDeleteOpen(false)}
          onConfirm={() => bulkDelete()}
        />
      )}

      {/* Floating Action Bar */}
      {selectedTcIds.size > 0 && (
        <div
          style={{
            position: "fixed",
            bottom: "1.5rem",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 240,
            background: "#fff",
            border: "1px solid var(--border)",
            boxShadow: "0 20px 40px -12px rgba(0, 0, 0, 0.18)",
            borderRadius: 12,
            padding: "0.6rem 1rem",
            display: "flex",
            alignItems: "center",
            gap: "1.25rem",
            animation: "modalIn 0.18s ease-out",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              borderRight: "1px solid var(--border)",
              paddingRight: "1rem",
            }}
          >
            <span
              style={{
                background: "#F59E0B",
                color: "#000",
                fontSize: "0.72rem",
                fontWeight: 700,
                width: 20,
                height: 20,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {selectedTcIds.size}
            </span>
            <span style={{ fontSize: "0.75rem", color: "#1F2937", fontWeight: 600 }}>
              {bulkMoving ? "Memindahkan..." : "Test Case Terpilih"}
            </span>
            {bulkMoving && (
              <Loader2
                size={14}
                style={{ color: "#F59E0B", animation: "spin 0.8s linear infinite" }}
              />
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <button
              type="button"
              onClick={() => setBulkMoveOpen(true)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                padding: "0.35rem 0.7rem",
                background: "#fff",
                border: "1px solid #D1D5DB",
                borderRadius: 3,
                color: "#374151",
                fontSize: "0.72rem",
                fontWeight: 400,
                cursor: "pointer",
                transition: "background-color 0.15s ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-muted)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
            >
              <FolderInput size={14} style={{ color: "var(--text-muted)" }} />
              Pindah Section
            </button>
            <button
              type="button"
              onClick={() => {
                setBulkDeleteCount(selectedTcIds.size);
                setBulkDeleteOpen(true);
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                padding: "0.35rem 0.7rem",
                background: "#FEF2F2",
                border: "1px solid #FECACA",
                borderRadius: 3,
                color: "#DC2626",
                fontSize: "0.72rem",
                fontWeight: 400,
                cursor: "pointer",
                transition: "background-color 0.15s ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#FEE2E2")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "#FEF2F2")}
            >
              <Trash2 size={14} style={{ color: "#EF4444" }} />
              Hapus ({selectedTcIds.size})
            </button>
          </div>

          <button
            type="button"
            onClick={clearSelection}
            title="Batal Pilih"
            style={{
              border: "none",
              background: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              padding: "0.2rem",
              display: "flex",
            }}
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* Confirm hapus section */}
      <ConfirmDialog
        open={sectionDeleteTarget !== null}
        title="Hapus Section?"
        message={
          <>
            Section <strong>{sectionDeleteTarget?.name}</strong> akan dihapus. Test case di dalamnya
            akan kembali ke &quot;Unassigned Test Cases&quot; (tidak ikut terhapus).
          </>
        }
        onConfirm={() => {
          if (sectionDeleteTarget) void deleteSection(sectionDeleteTarget.id);
          setSectionDeleteTarget(null);
        }}
        onCancel={() => setSectionDeleteTarget(null)}
      />

      {/* Toast notification */}
      {toast.show && (
        <div
          role="status"
          style={{
            position: "fixed",
            top: "1.25rem",
            right: "1.25rem",
            zIndex: 300,
            display: "flex",
            alignItems: "center",
            gap: "0.6rem",
            background: "#fff",
            border: toast.type === "success" ? "1px solid #A7F3D0" : "1px solid #FECACA",
            boxShadow: "0 10px 30px -10px rgba(0, 0, 0, 0.2)",
            borderRadius: 8,
            padding: "0.7rem 1rem",
            animation: "modalIn 0.18s ease-out",
          }}
        >
          <CheckCircle2
            size={20}
            style={{ color: toast.type === "success" ? "#10B981" : "#EF4444", flexShrink: 0 }}
          />
          <div style={{ fontSize: "0.82rem", fontWeight: 500, color: "#1F2937" }}>
            {toast.message}
          </div>
          <button
            type="button"
            aria-label="Tutup notifikasi"
            onClick={() => setToast((prev) => ({ ...prev, show: false }))}
            style={{
              border: "none",
              background: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              padding: "0.15rem",
              display: "flex",
            }}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

function MoveSectionModal({
  tc,
  sections,
  onClose,
  onMove,
}: {
  tc: TestCase;
  sections: { id: string; name: string }[];
  onClose: () => void;
  onMove: (sectionId: string | null) => Promise<void>;
}) {
  const [selected, setSelected] = useState<string>("");

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Pindah Test Case"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        background: "rgba(0, 0, 0, 0.4)",
        backdropFilter: "blur(4px)",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 360,
          background: "#fff",
          borderRadius: 12,
          padding: "1.25rem",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          border: "1px solid var(--border)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          style={{ fontSize: "0.95rem", fontWeight: 600, margin: "0 0 0.25rem", color: "#111827" }}
        >
          Pindah Test Case
        </h3>
        <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: "0 0 1rem" }}>
          Pilih section tujuan untuk <b>{tc.tcId}</b>
        </p>

        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          style={{
            width: "100%",
            border: "1px solid #D1D5DB",
            borderRadius: 6,
            padding: "0.5rem 0.6rem",
            fontSize: "0.82rem",
            marginBottom: "1rem",
            outline: "none",
            background: "#fff",
          }}
        >
          <option value="" disabled>
            -- Pilih Section --
          </option>
          <option value="__none__">Unassigned Test Cases</option>
          {sections.map((sec) => (
            <option key={sec.id} value={sec.id}>
              {sec.name}
            </option>
          ))}
        </select>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "0.4rem 0.9rem",
              border: "1px solid #D1D5DB",
              borderRadius: 6,
              background: "#fff",
              color: "#374151",
              fontSize: "0.78rem",
              cursor: "pointer",
            }}
          >
            Batal
          </button>
          <button
            type="button"
            disabled={!selected}
            onClick={() => void onMove(selected === "__none__" ? null : selected)}
            style={{
              padding: "0.4rem 1rem",
              border: "none",
              borderRadius: 6,
              background: "#F59E0B",
              color: "#000000",
              fontSize: "0.78rem",
              fontWeight: 500,
              cursor: selected ? "pointer" : "not-allowed",
              opacity: selected ? 1 : 0.5,
            }}
          >
            Pindahkan
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function AddSectionModal({
  onClose,
  onSave,
  sectionTitle,
  setSectionTitle,
  sectionDesc,
  setSectionDesc,
}: {
  onClose: () => void;
  onSave: () => void;
  sectionTitle: string;
  setSectionTitle: (v: string) => void;
  sectionDesc: string;
  setSectionDesc: (v: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Tambah Section Baru"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        background: "rgba(15, 23, 42, 0.4)",
        backdropFilter: "blur(4px)",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 480,
          display: "flex",
          flexDirection: "column",
          background: "#ffffff",
          borderRadius: 12,
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          overflow: "hidden",
          animation: "modalIn 0.18s ease-out",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "1rem 1.25rem",
            borderBottom: "1px solid var(--border)",
            background: "var(--surface-muted)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: "#FEF3C7",
                color: "#F59E0B",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Layers size={17} />
            </div>
            <h3 style={{ fontSize: "1rem", fontWeight: 600, margin: 0 }}>Tambah Section Baru</h3>
          </div>
          <button
            type="button"
            aria-label="Tutup"
            onClick={onClose}
            style={{
              width: 30,
              height: 30,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "none",
              background: "transparent",
              color: "var(--text-muted)",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.6rem",
              padding: "0.6rem 0.75rem",
              background: "var(--surface-muted)",
              border: "1px solid var(--border)",
              borderRadius: 10,
            }}
          >
            <Layers size={18} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
            <input
              ref={inputRef}
              value={sectionTitle}
              onChange={(e) => setSectionTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSave();
              }}
              placeholder="Masukkan Nama Section..."
              style={{
                flex: 1,
                border: "none",
                outline: "none",
                background: "transparent",
                fontSize: "0.95rem",
                minWidth: 0,
              }}
            />
          </div>
          <div>
            <label
              style={{
                fontSize: "0.72rem",
                fontWeight: 500,
                color: "var(--text-muted)",
                display: "block",
                marginBottom: "0.35rem",
              }}
            >
              Deskripsi Singkat (Opsional)
            </label>
            <textarea
              value={sectionDesc}
              onChange={(e) => setSectionDesc(e.target.value)}
              rows={2}
              placeholder="Tambahkan catatan singkat tentang section ini..."
              style={{
                width: "100%",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: "0.55rem 0.7rem",
                fontSize: "0.85rem",
                outline: "none",
                resize: "none",
              }}
            />
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "0.6rem",
            padding: "0.9rem 1.25rem",
            borderTop: "1px solid var(--border)",
            background: "var(--surface-muted)",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "0.45rem 1.1rem",
              borderRadius: 3,
              border: "1px solid #D1D5DB",
              background: "#fff",
              color: "#374151",
              fontWeight: 500,
              fontSize: "0.85rem",
              cursor: "pointer",
            }}
          >
            Batal
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={!sectionTitle.trim()}
            style={{
              padding: "0.45rem 1.2rem",
              borderRadius: 3,
              border: "none",
              background: "#F59E0B",
              color: "#000000",
              fontWeight: 400,
              fontSize: "0.85rem",
              cursor: sectionTitle.trim() ? "pointer" : "not-allowed",
              opacity: sectionTitle.trim() ? 1 : 0.5,
              transition: "background-color 0.15s ease",
            }}
            onMouseEnter={(e) => {
              if (sectionTitle.trim()) e.currentTarget.style.background = "#D97706";
            }}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#F59E0B")}
          >
            Simpan
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function TestCaseDetailModal({
  tc,
  canEdit,
  onClose,
  onEdit,
}: {
  tc: TestCase;
  canEdit: boolean;
  onClose: () => void;
  onEdit: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Steps: pisahkan per baris kalau ada, untuk tampilan step-by-step
  const stepsList = (tc.steps ?? "")
    .split("\n")
    .map((st) => st.trim())
    .filter(Boolean);

  // Expected Result per langkah: jika blok expectedResult punya jumlah baris
  // sama dengan steps, petakan per baris; jika tidak, tampil sebagai blok global.
  const stepExpectedResults = (tc.expectedResult ?? "")
    .split("\n")
    .map((st) => st.trim())
    .filter(Boolean);

  // Pill warna untuk priority & status
  const priorityPill: React.CSSProperties = {
    display: "inline-block",
    padding: "0.15rem 0.55rem",
    borderRadius: 4,
    fontSize: "0.68rem",
    fontWeight: 700,
    letterSpacing: "0.03em",
    background:
      tc.priority === "CRITICAL"
        ? "#FEE2E2"
        : tc.priority === "HIGH"
          ? "#FFEDD5"
          : tc.priority === "MEDIUM"
            ? "#DBEAFE"
            : "#F3F4F6",
    color:
      tc.priority === "CRITICAL"
        ? "#B91C1C"
        : tc.priority === "HIGH"
          ? "#C2410C"
          : tc.priority === "MEDIUM"
            ? "#1D4ED8"
            : "#374151",
  };

  const statusPill: React.CSSProperties = {
    display: "inline-block",
    padding: "0.15rem 0.55rem",
    borderRadius: 4,
    fontSize: "0.68rem",
    fontWeight: 700,
    letterSpacing: "0.03em",
    background: tc.status === "ACTIVE" ? "#D1FAE5" : tc.status === "DRAFT" ? "#FEF3C7" : "#FEE2E2",
    color: tc.status === "ACTIVE" ? "#047857" : tc.status === "DRAFT" ? "#B45309" : "#B91C1C",
  };

  const sectionLabel: React.CSSProperties = {
    fontSize: "0.72rem",
    fontWeight: 600,
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    margin: "0 0 0.4rem",
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Detail ${tc.tcId}`}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        background: "rgba(0, 0, 0, 0.5)",
        backdropFilter: "blur(4px)",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 640,
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          background: "#fff",
          borderRadius: 12,
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          border: "1px solid var(--border)",
          overflow: "hidden",
          animation: "modalIn 0.18s ease-out",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "0.75rem",
            padding: "1.25rem 1.5rem",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <span
              style={{
                fontFamily: "var(--font-mono, monospace)",
                fontSize: "0.72rem",
                color: "#9CA3AF",
                fontWeight: 500,
                letterSpacing: "0.02em",
              }}
            >
              {tc.tcId}
            </span>
            <h2
              style={{
                fontSize: "1.05rem",
                fontWeight: 700,
                margin: "0.3rem 0 0",
                color: "#111827",
                lineHeight: 1.35,
              }}
            >
              {tc.title}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Tutup"
            onClick={onClose}
            style={{
              width: 30,
              height: 30,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "none",
              background: "transparent",
              color: "var(--text-muted)",
              borderRadius: 6,
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div
          style={{
            padding: "1.25rem 1.5rem",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: "1.25rem",
          }}
        >
          {/* Metadata grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gap: "1rem",
              background: "rgba(248, 250, 252, 0.8)",
              border: "1px solid rgba(229, 231, 235, 0.8)",
              borderRadius: 8,
              padding: "1rem",
            }}
          >
            <div>
              <span
                style={{
                  display: "block",
                  color: "#9CA3AF",
                  fontWeight: 500,
                  fontSize: "0.72rem",
                  marginBottom: "0.25rem",
                }}
              >
                Priority
              </span>
              <span style={priorityPill}>{tc.priority}</span>
            </div>
            <div>
              <span
                style={{
                  display: "block",
                  color: "#9CA3AF",
                  fontWeight: 500,
                  fontSize: "0.72rem",
                  marginBottom: "0.25rem",
                }}
              >
                Status
              </span>
              <span style={statusPill}>{tc.status}</span>
            </div>
            <div>
              <span
                style={{
                  display: "block",
                  color: "#9CA3AF",
                  fontWeight: 500,
                  fontSize: "0.72rem",
                  marginBottom: "0.25rem",
                }}
              >
                Author
              </span>
              <span style={{ fontWeight: 600, color: "#1F2937", fontSize: "0.82rem" }}>
                {tc.createdBy?.name ?? "—"}
              </span>
            </div>
            <div>
              <span
                style={{
                  display: "block",
                  color: "#9CA3AF",
                  fontWeight: 500,
                  fontSize: "0.72rem",
                  marginBottom: "0.25rem",
                }}
              >
                Dibuat
              </span>
              <span style={{ fontWeight: 500, color: "#374151", fontSize: "0.82rem" }}>
                {tc.createdAt
                  ? new Date(tc.createdAt).toLocaleDateString("id-ID", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })
                  : "—"}
              </span>
            </div>
          </div>

          {/* Deskripsi / Skenario */}
          <div>
            <h4 style={sectionLabel}>Deskripsi / Skenario</h4>
            <p
              style={{
                margin: 0,
                fontSize: "0.88rem",
                color: "#374151",
                whiteSpace: "pre-wrap",
                lineHeight: 1.6,
              }}
            >
              {tc.scenario || (
                <span style={{ color: "#9CA3AF", fontStyle: "italic" }}>Tidak ada deskripsi.</span>
              )}
            </p>
          </div>

          {/* Pre-conditions */}
          <div>
            <h4 style={sectionLabel}>Pre-Conditions</h4>
            {tc.precondition ? (
              <ul
                style={{
                  margin: 0,
                  paddingLeft: "1.2rem",
                  background: "rgba(254, 243, 199, 0.4)",
                  border: "1px solid rgba(252, 211, 77, 0.5)",
                  borderRadius: 8,
                  padding: "0.7rem 1rem 0.7rem 1.8rem",
                  fontSize: "0.85rem",
                  color: "#374151",
                  lineHeight: 1.6,
                }}
              >
                {tc.precondition
                  .split("\n")
                  .map((line, i) => (line.trim() ? <li key={i}>{line.trim()}</li> : null))}
              </ul>
            ) : (
              <p style={{ margin: 0, fontSize: "0.85rem", color: "#9CA3AF", fontStyle: "italic" }}>
                Tidak ada pre-condition.
              </p>
            )}
          </div>

          {/* Test Data */}
          {tc.testData && (
            <div>
              <h4 style={sectionLabel}>Test Data</h4>
              <div
                style={{
                  background: "#F9FAFB",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: "0.65rem 0.8rem",
                  fontFamily: "var(--font-mono, monospace)",
                  fontSize: "0.75rem",
                  color: "#1F2937",
                  whiteSpace: "pre-wrap",
                  lineHeight: 1.6,
                }}
              >
                {tc.testData}
              </div>
            </div>
          )}

          {/* Expected Result (dedicated section) */}
          <div>
            <h4 style={sectionLabel}>Expected Result</h4>
            {tc.expectedResult ? (
              <p
                style={{
                  margin: 0,
                  fontSize: "0.88rem",
                  color: "#374151",
                  lineHeight: 1.6,
                  whiteSpace: "pre-wrap",
                }}
              >
                {tc.expectedResult}
              </p>
            ) : (
              <p style={{ margin: 0, color: "#9CA3AF", fontStyle: "italic", fontSize: "0.85rem" }}>
                Tidak ada expected result.
              </p>
            )}
          </div>

          {/* Test Steps */}
          <div>
            <h4 style={sectionLabel}>Test Steps</h4>
            <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
                <thead
                  style={{
                    background: "#F9FAFB",
                    borderBottom: "1px solid var(--border)",
                    color: "#6B7280",
                    textAlign: "left",
                  }}
                >
                  <tr>
                    <th
                      style={{
                        padding: "0.5rem 0.6rem",
                        width: 44,
                        textAlign: "center",
                        fontWeight: 600,
                        borderRight: "1px solid var(--border)",
                      }}
                    >
                      #
                    </th>
                    <th
                      style={{
                        padding: "0.5rem 0.75rem",
                        fontWeight: 600,
                        borderRight: "1px solid var(--border)",
                      }}
                    >
                      Step Action
                    </th>
                    <th style={{ padding: "0.5rem 0.75rem", fontWeight: 600 }}>Expected Result</th>
                  </tr>
                </thead>
                <tbody>
                  {stepsList.length === 0 ? (
                    <tr>
                      <td
                        colSpan={3}
                        style={{
                          padding: "1.25rem",
                          color: "#9CA3AF",
                          fontStyle: "italic",
                          textAlign: "center",
                        }}
                      >
                        Tidak ada langkah.
                      </td>
                    </tr>
                  ) : (
                    stepsList.map((step, i) => (
                      <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                        <td
                          style={{
                            padding: "0.5rem 0.6rem",
                            textAlign: "center",
                            fontWeight: 600,
                            color: "#9CA3AF",
                            borderRight: "1px solid var(--border)",
                          }}
                        >
                          {i + 1}
                        </td>
                        <td
                          style={{
                            padding: "0.5rem 0.75rem",
                            color: "#374151",
                            lineHeight: 1.55,
                            borderRight: "1px solid var(--border)",
                          }}
                        >
                          {step}
                        </td>
                        <td
                          style={{ padding: "0.5rem 0.75rem", color: "#374151", lineHeight: 1.55 }}
                        >
                          {stepExpectedResults.length === stepsList.length &&
                          stepExpectedResults[i] ? (
                            stepExpectedResults[i]
                          ) : (
                            <span style={{ color: "#9CA3AF", fontStyle: "italic" }}>—</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.75rem",
            padding: "0.9rem 1.5rem",
            borderTop: "1px solid var(--border)",
            background: "rgba(249, 250, 251, 0.5)",
          }}
        >
          <Link
            href={`/test-cases/${tc.id}?tab=runs`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.35rem",
              color: "#1D4ED8",
              fontSize: "0.8rem",
              fontWeight: 500,
              textDecoration: "none",
            }}
          >
            <History size={14} /> Lihat Run History
          </Link>
          {canEdit && (
            <button
              type="button"
              onClick={onEdit}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                padding: "0.45rem 1.1rem",
                border: "none",
                borderRadius: 3,
                background: "#F59E0B",
                color: "#000000",
                fontSize: "0.78rem",
                fontWeight: 400,
                cursor: "pointer",
              }}
            >
              <Pencil size={14} /> Edit Test Case
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function DeleteTestCaseModal({
  tcTitle,
  onClose,
  onConfirm,
}: {
  tcTitle: string;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const [phase, setPhase] = useState<"confirm" | "processing" | "success">("confirm");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timer saat modal unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && phase === "confirm") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [phase, onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const handleConfirm = async () => {
    setPhase("processing");
    try {
      await onConfirm();
      setPhase("success");
      timerRef.current = setTimeout(() => {
        onClose();
      }, 900);
    } catch {
      // Gagal: kembali ke konfirmasi supaya user bisa coba lagi
      setPhase("confirm");
    }
  };

  return createPortal(
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label="Hapus Test Case"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 250,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        background: "rgba(0, 0, 0, 0.5)",
        backdropFilter: "blur(4px)",
      }}
      onClick={phase === "confirm" ? onClose : undefined}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 400,
          background: "#fff",
          borderRadius: 12,
          padding: "1.5rem",
          border: "1px solid var(--border)",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          textAlign: "center",
          position: "relative",
          animation: "modalIn 0.18s ease-out",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close (hanya saat konfirmasi) */}
        {phase === "confirm" && (
          <button
            type="button"
            aria-label="Tutup"
            onClick={onClose}
            style={{
              position: "absolute",
              top: "0.9rem",
              right: "0.9rem",
              border: "none",
              background: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              padding: "0.25rem",
              borderRadius: 6,
              display: "flex",
            }}
          >
            <X size={16} />
          </button>
        )}

        {/* STATE 1: KONFIRMASI */}
        {phase === "confirm" && (
          <>
            {/* Warning icon badge */}
            <div
              style={{
                margin: "0 auto 1rem",
                width: 48,
                height: 48,
                borderRadius: "50%",
                background: "#FEE2E2",
                color: "#DC2626",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Trash2 size={22} />
            </div>

            <h3
              style={{
                fontSize: "1.05rem",
                fontWeight: 700,
                margin: "0 0 0.5rem",
                color: "#111827",
              }}
            >
              Hapus Test Case?
            </h3>
            <p
              style={{
                fontSize: "0.8rem",
                color: "var(--text-secondary)",
                margin: "0 0 1.5rem",
                lineHeight: 1.55,
              }}
            >
              Apakah Anda yakin ingin menghapus{" "}
              <span style={{ fontWeight: 600, color: "#111827" }}>&quot;{tcTitle}&quot;</span>?
              Tindakan ini tidak dapat dibatalkan.
            </p>

            {/* Actions */}
            <div style={{ display: "flex", gap: "0.6rem", justifyContent: "center" }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  flex: 1,
                  padding: "0.5rem 0",
                  border: "1px solid #D1D5DB",
                  borderRadius: 6,
                  background: "#fff",
                  color: "#374151",
                  fontSize: "0.8rem",
                  fontWeight: 500,
                  cursor: "pointer",
                  transition: "background-color 0.15s ease",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-muted)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => void handleConfirm()}
                style={{
                  flex: 1,
                  padding: "0.5rem 0",
                  border: "none",
                  borderRadius: 6,
                  background: "#DC2626",
                  color: "#fff",
                  fontSize: "0.8rem",
                  fontWeight: 500,
                  cursor: "pointer",
                  boxShadow: "var(--shadow-sm)",
                  transition: "background-color 0.15s ease",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#B91C1C")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "#DC2626")}
              >
                Hapus
              </button>
            </div>
          </>
        )}

        {/* STATE 2: PROCESSING */}
        {phase === "processing" && (
          <>
            <div
              style={{
                margin: "0 auto 1rem",
                width: 48,
                height: 48,
                borderRadius: "50%",
                background: "#FFFBEB",
                color: "#D97706",
                border: "1px solid #FDE68A",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Loader2 size={24} style={{ animation: "spin 1s linear infinite" }} />
            </div>

            <h3
              style={{
                fontSize: "0.95rem",
                fontWeight: 700,
                margin: "0 0 0.25rem",
                color: "#111827",
              }}
            >
              Menghapus Test Case...
            </h3>
            <p
              style={{
                fontSize: "0.78rem",
                color: "var(--text-muted)",
                margin: "0",
                lineHeight: 1.5,
              }}
            >
              Mohon tunggu, sedang memproses penghapusan &quot;{tcTitle}&quot;.
            </p>
          </>
        )}

        {/* STATE 3: SUCCESS */}
        {phase === "success" && (
          <>
            <div
              style={{
                margin: "0 auto 1rem",
                width: 48,
                height: 48,
                borderRadius: "50%",
                background: "#D1FAE5",
                color: "#059669",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <CheckCircle2 size={24} />
            </div>

            <h3
              style={{
                fontSize: "0.95rem",
                fontWeight: 700,
                margin: "0 0 0.25rem",
                color: "#111827",
              }}
            >
              Berhasil Dihapus!
            </h3>
            <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", margin: "0" }}>
              &quot;{tcTitle}&quot; telah dihapus.
            </p>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}

/* ---------- Import Wizard (Step 2: Preview & Mapping) ---------- */

const IMPORT_FIELDS = [
  { value: "title", label: "Title (Judul)" },
  { value: "tcId", label: "TC ID" },
  { value: "scenario", label: "Scenario" },
  { value: "precondition", label: "Pre-conditions" },
  { value: "steps", label: "Step Action" },
  { value: "testData", label: "Test Data" },
  { value: "expectedResult", label: "Expected Result" },
  { value: "priority", label: "Priority" },
  { value: "status", label: "Status" },
] as const;

/** Auto-match: cocokkan nama header file ke field sistem (case-insensitive, toleran spasi/_/-). */
const autoMatchField = (header: string): string => {
  const key = header
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "_");
  const map: Record<string, string> = {
    title: "title",
    judul: "title",
    tc_id: "tcId",
    tcid: "tcId",
    test_case_id: "tcId",
    testcaseid: "tcId",
    scenario: "scenario",
    deskripsi: "scenario",
    detail_skenario: "scenario",
    precondition: "precondition",
    pre_condition: "precondition",
    preconditions: "precondition",
    steps: "steps",
    step_action: "steps",
    stepactions: "steps",
    langkah: "steps",
    langkah_langkah: "steps",
    test_data: "testData",
    testdata: "testData",
    expected_result: "expectedResult",
    expectedresult: "expectedResult",
    expected: "expectedResult",
    ekspektasi_hasil: "expectedResult",
    ekspektasi: "expectedResult",
    hasil_yang_diharapkan: "expectedResult",
    hasil_diharapkan: "expectedResult",
    hasil_ekspektasi: "expectedResult",
    priority: "priority",
    prioritas: "priority",
    status: "status",
  };
  return map[key] ?? "";
};

function ImportWizardModal({
  step,
  fileName,
  headers,
  rows,
  onClose,
  onProceedToPreview,
  onStartImport,
}: {
  step: 1 | 2;
  fileName: string;
  headers: string[];
  rows: Record<string, string>[];
  onClose: () => void;
  onProceedToPreview: () => void;
  onStartImport: (mapping: Record<string, string>) => void | Promise<void>;
}) {
  // mapping: header file -> field sistem ("" = tidak dipetakan)
  const [mapping, setMapping] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const h of headers) initial[h] = autoMatchField(h);
    return initial;
  });
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const mappedField = (header: string) => mapping[header] ?? "";
  const setField = (header: string, field: string) =>
    setMapping((prev) => ({ ...prev, [header]: field }));

  // Validasi: Title wajib terpetakan, Expected Result wajib terpetakan
  const titleHeader = headers.find((h) => mappedField(h) === "title");
  const expectedHeader = headers.find((h) => mappedField(h) === "expectedResult");
  const canImport = !!titleHeader && !!expectedHeader;

  // Sampel 8 baris pertama
  const previewRows = rows.slice(0, 8);
  const invalidRows = previewRows
    .map((r, i) => ({ idx: i + 1, title: titleHeader ? (r[titleHeader] ?? "").trim() : "" }))
    .filter((r) => !r.title);

  const cellValue = (r: Record<string, string>, field: string) => {
    const header = headers.find((h) => mappedField(h) === field);
    return header ? (r[header] ?? "") : "";
  };

  const handleStart = async () => {
    setStarting(true);
    await onStartImport(mapping);
    setStarting(false);
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Preview & Mapping Import"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 260,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        background: "rgba(0, 0, 0, 0.5)",
        backdropFilter: "blur(4px)",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 720,
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          background: "#fff",
          borderRadius: 12,
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          overflow: "hidden",
          animation: "modalIn 0.18s ease-out",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "1rem 1.25rem",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div>
            <h3 style={{ fontSize: "1.05rem", fontWeight: 700, margin: 0 }}>
              {step === 1 ? "Upload File" : "Preview & Mapping Import"}
            </h3>
            <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: "0.2rem 0 0" }}>
              {fileName} · {rows.length} baris
            </p>
          </div>
          <button
            type="button"
            aria-label="Tutup"
            onClick={onClose}
            style={{
              width: 30,
              height: 30,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "none",
              background: "transparent",
              color: "var(--text-secondary)",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div
          style={{
            padding: "1.25rem",
            display: "flex",
            flexDirection: "column",
            gap: "1.25rem",
            overflowY: "auto",
          }}
        >
          {/* Stepper */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              fontSize: "0.75rem",
              fontWeight: 600,
            }}
          >
            <span
              style={
                step === 1
                  ? {
                      color: "#111827",
                      background: "#FFFBEB",
                      border: "1px solid #FDE68A",
                      borderRadius: 999,
                      padding: "0.15rem 0.6rem",
                    }
                  : { color: "#059669" }
              }
            >
              {step > 1 ? "✓ " : ""}1. Upload File
            </span>
            <span style={{ color: "var(--text-muted)" }}>—</span>
            <span
              style={
                step === 2
                  ? {
                      color: "#111827",
                      background: "#FFFBEB",
                      border: "1px solid #FDE68A",
                      borderRadius: 999,
                      padding: "0.15rem 0.6rem",
                    }
                  : { color: "var(--text-muted)" }
              }
            >
              2. Mapping & Preview
            </span>
            <span style={{ color: "var(--text-muted)" }}>—</span>
            <span style={{ color: "var(--text-muted)" }}>3. Import</span>
          </div>

          {step === 1 && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "0.75rem",
                padding: "2.5rem 1rem",
                border: "2px dashed var(--border-strong)",
                borderRadius: 12,
                textAlign: "center",
              }}
            >
              <Upload size={28} style={{ color: "var(--text-muted)" }} />
              <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "#111827" }}>
                File siap diimpor
              </div>
              <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                <strong>{fileName}</strong> · {rows.length} baris terdeteksi.
                <br />
                Lanjutkan untuk memeriksa & memetakan kolom sebelum import.
              </div>
            </div>
          )}

          {step === 2 && (
            <>
              {/* Field Mapping */}
              <div>
                <h4
                  style={{
                    fontSize: "0.82rem",
                    fontWeight: 700,
                    color: "var(--text-secondary)",
                    margin: "0 0 0.6rem",
                  }}
                >
                  Field Mapping
                </h4>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
                  {headers.map((h) => (
                    <div
                      key={h}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.6rem",
                        flexWrap: "wrap",
                      }}
                    >
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: "0.78rem",
                          fontWeight: 600,
                          color: "#374151",
                          width: 180,
                          flexShrink: 0,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {h}
                      </span>
                      <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>→</span>
                      <select
                        value={mappedField(h)}
                        onChange={(e) => setField(h, e.target.value)}
                        style={{
                          flex: 1,
                          minWidth: 180,
                          padding: "0.35rem 0.5rem",
                          border: "1px solid var(--border-strong)",
                          borderRadius: 6,
                          fontSize: "0.78rem",
                          background: "#fff",
                          cursor: "pointer",
                        }}
                      >
                        <option value="">— Jangan diimpor —</option>
                        {IMPORT_FIELDS.map((f) => (
                          <option key={f.value} value={f.value}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                      {mappedField(h) === "title" && (
                        <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "#059669" }}>
                          wajib
                        </span>
                      )}
                      {mappedField(h) === "expectedResult" && (
                        <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "#059669" }}>
                          wajib
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Data Preview */}
              <div>
                <h4
                  style={{
                    fontSize: "0.82rem",
                    fontWeight: 700,
                    color: "var(--text-secondary)",
                    margin: "0 0 0.6rem",
                  }}
                >
                  Data Preview (8 baris pertama)
                </h4>
                {invalidRows.length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.25rem",
                      marginBottom: "0.6rem",
                    }}
                  >
                    {invalidRows.map((r) => (
                      <span
                        key={r.idx}
                        style={{ fontSize: "0.75rem", color: "#DC2626", fontWeight: 600 }}
                      >
                        Baris {r.idx}: Title tidak boleh kosong
                      </span>
                    ))}
                  </div>
                )}
                <div
                  style={{ border: "1px solid var(--border)", borderRadius: 8, overflowX: "auto" }}
                >
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem" }}>
                    <thead>
                      <tr style={{ background: "#F9FAFB", color: "#6B7280", textAlign: "left" }}>
                        <th
                          style={{
                            padding: "0.5rem 0.6rem",
                            width: 44,
                            fontWeight: 600,
                            borderRight: "1px solid var(--border)",
                          }}
                        >
                          #
                        </th>
                        <th
                          style={{
                            padding: "0.5rem 0.6rem",
                            fontWeight: 600,
                            borderRight: "1px solid var(--border)",
                          }}
                        >
                          Title
                        </th>
                        <th
                          style={{
                            padding: "0.5rem 0.6rem",
                            fontWeight: 600,
                            borderRight: "1px solid var(--border)",
                          }}
                        >
                          Pre-conditions
                        </th>
                        <th
                          style={{
                            padding: "0.5rem 0.6rem",
                            fontWeight: 600,
                            borderRight: "1px solid var(--border)",
                          }}
                        >
                          Step Action
                        </th>
                        <th style={{ padding: "0.5rem 0.6rem", fontWeight: 600 }}>
                          Expected Result
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((r, i) => {
                        const invalid = !(titleHeader ? (r[titleHeader] ?? "").trim() : "");
                        return (
                          <tr
                            key={i}
                            style={{
                              borderTop: "1px solid var(--border)",
                              background: invalid ? "#FEF2F2" : "transparent",
                            }}
                          >
                            <td
                              style={{
                                padding: "0.45rem 0.6rem",
                                textAlign: "center",
                                color: "#9CA3AF",
                                borderRight: "1px solid var(--border)",
                              }}
                            >
                              {i + 1}
                            </td>
                            <td
                              style={{
                                padding: "0.45rem 0.6rem",
                                color: invalid ? "#DC2626" : "#111827",
                                fontWeight: 500,
                                borderRight: "1px solid var(--border)",
                                maxWidth: 160,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {cellValue(r, "title") || "—"}
                            </td>
                            <td
                              style={{
                                padding: "0.45rem 0.6rem",
                                color: "#374151",
                                borderRight: "1px solid var(--border)",
                                maxWidth: 140,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {cellValue(r, "precondition") || "—"}
                            </td>
                            <td
                              style={{
                                padding: "0.45rem 0.6rem",
                                color: "#374151",
                                borderRight: "1px solid var(--border)",
                                maxWidth: 160,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {cellValue(r, "steps") || "—"}
                            </td>
                            <td
                              style={{
                                padding: "0.45rem 0.6rem",
                                color: "#374151",
                                maxWidth: 160,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {cellValue(r, "expectedResult") || "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Validation badge */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.4rem",
                    marginTop: "0.75rem",
                    padding: "0.5rem 0.75rem",
                    borderRadius: 8,
                    background: canImport ? "#ECFDF5" : "#FEF2F2",
                    border: `1px solid ${canImport ? "#A7F3D0" : "#FECACA"}`,
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    color: canImport ? "#047857" : "#DC2626",
                  }}
                >
                  {canImport ? (
                    <>
                      <CheckCircle2 size={15} />
                      {rows.length} Baris Valid Siap di-Import
                    </>
                  ) : (
                    <>
                      <AlertCircle size={15} />
                      Petakan kolom Title &amp; Expected Result untuk melanjutkan
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "0.5rem",
            padding: "1rem 1.25rem",
            borderTop: "1px solid var(--border)",
            background: "var(--surface-muted)",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "0.45rem 1rem",
              borderRadius: "3px !important",
              border: "1px solid #D1D5DB",
              background: "#fff",
              color: "#374151",
              fontWeight: 500,
              fontSize: "0.85rem",
              cursor: "pointer",
              transition: "background-color 0.15s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-muted)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
          >
            Batal
          </button>
          {step === 1 ? (
            <button
              type="button"
              onClick={onProceedToPreview}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                padding: "0.45rem 1.1rem",
                borderRadius: "3px !important",
                border: "none",
                background: "#F59E0B",
                color: "#000000",
                fontWeight: 500,
                fontSize: "0.85rem",
                cursor: "pointer",
                transition: "background-color 0.15s ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#D97706")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "#F59E0B")}
            >
              Lanjut ke Preview
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleStart()}
              disabled={!canImport || starting}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                padding: "0.45rem 1.1rem",
                borderRadius: "3px !important",
                border: "none",
                background: "#F59E0B",
                color: "#000000",
                fontWeight: 500,
                fontSize: "0.85rem",
                cursor: !canImport || starting ? "not-allowed" : "pointer",
                opacity: !canImport ? 0.5 : 1,
                transition: "background-color 0.15s ease",
              }}
              onMouseEnter={(e) => {
                if (canImport && !starting) e.currentTarget.style.background = "#D97706";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "#F59E0B";
              }}
            >
              {starting ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                  <Loader2 size={13} style={{ animation: "spin 0.8s linear infinite" }} />{" "}
                  Memproses...
                </span>
              ) : (
                "Impor Test Case"
              )}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function BulkUploadProgressModal({
  upload,
  onClose,
}: {
  upload: {
    open: boolean;
    status: "processing" | "success" | "error";
    total: number;
    processed: number;
    failedRows: number[];
  };
  onClose: () => void;
}) {
  const progress =
    upload.total > 0 ? Math.min(100, Math.round((upload.processed / upload.total) * 100)) : 0;

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Impor Test Case"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 260,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        background: "rgba(0, 0, 0, 0.5)",
        backdropFilter: "blur(4px)",
      }}
      onClick={upload.status === "processing" ? undefined : onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: "#fff",
          borderRadius: 12,
          padding: "1.5rem",
          border: "1px solid var(--border)",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          textAlign: "center",
          animation: "modalIn 0.18s ease-out",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* STATE 1: PROCESSING */}
        {upload.status === "processing" && (
          <>
            <div
              style={{
                margin: "0 auto 1rem",
                width: 48,
                height: 48,
                borderRadius: "50%",
                background: "#FFFBEB",
                color: "#D97706",
                border: "1px solid #FDE68A",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Loader2
                size={24}
                className="animate-spin"
                style={{ animation: "spin 1s linear infinite" }}
              />
            </div>

            <h3
              style={{
                fontSize: "0.95rem",
                fontWeight: 700,
                margin: "0 0 0.25rem",
                color: "#111827",
              }}
            >
              Uploading Test Case...
            </h3>
            <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: "0 0 1.25rem" }}>
              Processing Data ({upload.processed}/{upload.total})
            </p>

            <div
              style={{
                width: "100%",
                background: "var(--surface-muted)",
                borderRadius: 999,
                height: 12,
                marginBottom: "0.5rem",
                overflow: "hidden",
                border: "1px solid var(--border)",
              }}
            >
              <div
                style={{
                  background: "#F59E0B",
                  height: "100%",
                  borderRadius: 999,
                  width: `${progress}%`,
                  transition: "width 0.3s ease-out",
                }}
              />
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: "0.68rem",
                color: "var(--text-muted)",
                fontWeight: 500,
              }}
            >
              <span>Proses Impor</span>
              <span>{progress}%</span>
            </div>
          </>
        )}

        {/* STATE 2: SUCCESS */}
        {upload.status === "success" && (
          <>
            <div
              style={{
                margin: "0 auto 1rem",
                width: 48,
                height: 48,
                borderRadius: "50%",
                background: "#D1FAE5",
                color: "#059669",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <CheckCircle2 size={24} />
            </div>

            <h3
              style={{
                fontSize: "0.95rem",
                fontWeight: 700,
                margin: "0 0 0.25rem",
                color: "#111827",
              }}
            >
              Impor Berhasil!
            </h3>
            <p
              style={{
                fontSize: "0.78rem",
                color: "var(--text-secondary)",
                margin: "0 0 1.5rem",
                lineHeight: 1.5,
              }}
            >
              Sebanyak{" "}
              <span style={{ fontWeight: 600, color: "#111827" }}>
                {upload.total - upload.failedRows.length} Test Cases
              </span>{" "}
              telah berhasil ditambahkan ke dalam suite.
            </p>

            <button
              type="button"
              onClick={onClose}
              style={{
                width: "100%",
                padding: "0.5rem 0",
                border: "none",
                borderRadius: 6,
                background: "#F59E0B",
                color: "#000000",
                fontSize: "0.8rem",
                fontWeight: 500,
                cursor: "pointer",
                transition: "background-color 0.15s ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#D97706")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "#F59E0B")}
            >
              Selesai
            </button>
          </>
        )}

        {/* STATE 3: ERROR */}
        {upload.status === "error" && (
          <>
            <div
              style={{
                margin: "0 auto 1rem",
                width: 48,
                height: 48,
                borderRadius: "50%",
                background: "#FEE2E2",
                color: "#DC2626",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <AlertCircle size={24} />
            </div>

            <h3
              style={{
                fontSize: "0.95rem",
                fontWeight: 700,
                margin: "0 0 0.25rem",
                color: "#111827",
              }}
            >
              Gagal Mengunggah
            </h3>
            <p
              style={{
                fontSize: "0.78rem",
                color: "var(--text-secondary)",
                margin: "0 0 1rem",
                lineHeight: 1.5,
              }}
            >
              Terjadi kesalahan saat membaca file. Pastikan format kolom sesuai dengan template.
            </p>

            {upload.failedRows.length > 0 && (
              <div
                style={{
                  background: "#FEF2F2",
                  border: "1px solid #FECACA",
                  borderRadius: 8,
                  padding: "0.6rem 0.8rem",
                  marginBottom: "1rem",
                  textAlign: "left",
                }}
              >
                <div
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    color: "#B91C1C",
                    marginBottom: "0.3rem",
                  }}
                >
                  {upload.failedRows.length} baris gagal divalidasi
                </div>
                <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>
                  Baris: {upload.failedRows.join(", ")}
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              style={{
                width: "100%",
                padding: "0.5rem 0",
                border: "1px solid #D1D5DB",
                borderRadius: 6,
                background: "#fff",
                color: "#374151",
                fontSize: "0.8rem",
                fontWeight: 500,
                cursor: "pointer",
                transition: "background-color 0.15s ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-muted)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
            >
              Tutup &amp; Coba Lagi
            </button>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}

function BulkMoveModal({
  sections,
  onClose,
  onMove,
}: {
  sections: { id: string; name: string }[];
  onClose: () => void;
  onMove: (sectionId: string | null) => Promise<void>;
}) {
  const [selected, setSelected] = useState<string>("");

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Pindah Section"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 270,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        background: "rgba(0, 0, 0, 0.4)",
        backdropFilter: "blur(4px)",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 360,
          background: "#fff",
          borderRadius: 12,
          padding: "1.25rem",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          border: "1px solid var(--border)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          style={{ fontSize: "0.95rem", fontWeight: 600, margin: "0 0 0.25rem", color: "#111827" }}
        >
          Pindah Test Case
        </h3>
        <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: "0 0 1rem" }}>
          Pilih section tujuan untuk semua test case terpilih
        </p>

        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          style={{
            width: "100%",
            border: "1px solid #D1D5DB",
            borderRadius: 6,
            padding: "0.5rem 0.6rem",
            fontSize: "0.82rem",
            marginBottom: "1rem",
            outline: "none",
            background: "#fff",
          }}
        >
          <option value="" disabled>
            -- Pilih Section --
          </option>
          <option value="__none__">Unassigned Test Cases</option>
          {sections.map((sec) => (
            <option key={sec.id} value={sec.id}>
              {sec.name}
            </option>
          ))}
        </select>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "0.4rem 0.9rem",
              border: "1px solid #D1D5DB",
              borderRadius: 6,
              background: "#fff",
              color: "#374151",
              fontSize: "0.78rem",
              cursor: "pointer",
            }}
          >
            Batal
          </button>
          <button
            type="button"
            disabled={!selected}
            onClick={() => void onMove(selected === "__none__" ? null : selected)}
            style={{
              padding: "0.4rem 1rem",
              border: "none",
              borderRadius: 6,
              background: "#F59E0B",
              color: "#000000",
              fontSize: "0.78rem",
              fontWeight: 500,
              cursor: selected ? "pointer" : "not-allowed",
              opacity: selected ? 1 : 0.5,
            }}
          >
            Pindahkan
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
