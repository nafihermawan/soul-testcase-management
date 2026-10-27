"use client";

import { FolderInput, Pencil, Trash2 } from "lucide-react";
import { RowActionsMenu } from "@/components/settings/row-actions-menu";
import { Select } from "@/components/ui/select";
import {
  plainSelectStyle,
  priorityTone,
  statusTone,
  typeTone,
  type TestCase,
} from "./test-cases-shared";

export function TestCaseTable({
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
  onQuickUpdate,
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
  /** Select All untuk daftar TC yang sedang ditampilkan (per section). */
  onToggleAll?: (tcList: TestCase[]) => void;
  onQuickUpdate: (
    t: TestCase,
    data: {
      priority?: TestCase["priority"];
      status?: TestCase["status"];
      type?: TestCase["type"];
    }
  ) => void;
}) {
  if (testCases.length === 0) {
    return (
      <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", margin: "0.25rem 0" }}>
        Belum ada test case di suite ini.
      </p>
    );
  }

  /** TC yang statusnya Deprecated — selalu diletakkan di bawah. */
  const isDeprecated = (t: TestCase) => t.status === "DEPRECATED";

  /**
   * Urutan tampilan tabel: TC non-Deprecated lebih dulu, lalu semua TC
   * Deprecated di bagian paling bawah.
   *
   * Urutan DI DALAM tiap grup sengaja TIDAK diacak ulang — mengikuti urutan dari
   * server (`order` lalu `createdAt`, lihat `/api/suites/[id]`) supaya urutan
   * yang sudah ada tidak berubah. Partisi ditulis sebagai dua filter (bukan
   * `sort`) agar urutannya stabil.
   *
   * Dihitung saat render, bukan disimpan di state, sehingga mengubah status TC
   * lewat dropdown langsung memindahkan barisnya ke bawah tanpa reload.
   */
  const orderedTestCases = [
    ...testCases.filter((t) => !isDeprecated(t)),
    ...testCases.filter(isDeprecated),
  ];

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
              // Header 12px semibold (text-xs): sebelumnya mewarisi fontSize tabel
              // (0.85rem / 13.6px) sehingga lebih besar dari isi selnya (11-12px).
              fontSize: 12,
            }}
          >
            {canEdit && onToggleTc && (
              // Padding vertikal disamakan dengan sel checkbox-nya (0.4rem) supaya
              // tinggi header & barisnya presisi.
              <th style={{ padding: "0.4rem 0.4rem", width: 40, textAlign: "center" }}>
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
            <th style={{ padding: "0.5rem 1rem", fontWeight: 600, width: 220, textAlign: "left" }}>
              TC ID
            </th>
            <th style={{ padding: "0.5rem 0.5rem", fontWeight: 600, width: "auto", textAlign: "left" }}>
              Title
            </th>
            <th style={{ padding: "0.5rem 0.5rem", fontWeight: 600, width: 144, textAlign: "left" }}>
              Type
            </th>
            <th style={{ padding: "0.5rem 0.5rem", fontWeight: 600, width: 144, textAlign: "left" }}>
              Priority
            </th>
            <th style={{ padding: "0.5rem 0.5rem", fontWeight: 600, width: 144, textAlign: "left" }}>
              Status
            </th>
            {canEdit && (
              <th
                style={{
                  padding: "0.5rem 0.5rem",
                  fontWeight: 600,
                  textAlign: "center",
                  width: 64,
                }}
              >
                Opsi
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {orderedTestCases.map((t) => (
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
              // Seluruh baris (kecuali kontrol interaktif di dalamnya) membuka
              // Detail Modal; seleksi teks dibiarkan tidak memicu modal.
              onClick={() => {
                if (window.getSelection()?.toString()) return;
                onOpenDetail?.(t);
              }}
              style={{
                borderBottom: "1px solid var(--border)",
                cursor: "pointer",
                transition: "background 0.15s ease",
                // Cue visual untuk TC Deprecated — tetap bisa diinteraksi.
                opacity: isDeprecated(t) ? 0.6 : 1,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(248, 250, 252, 0.8)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              {canEdit && onToggleTc && (
                <td style={{ padding: "0.4rem 0.4rem", width: 40, textAlign: "center" }}>
                  <input
                    type="checkbox"
                    checked={selectedTcIds?.has(t.id) ?? false}
                    onChange={() => onToggleTc?.(t.id)}
                    // Checkbox bukan bagian dari aksi "buka detail".
                    onClick={(e) => e.stopPropagation()}
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
                  textAlign: "left",
                }}
              >
                <button
                  type="button"
                  onClick={() => onOpenDetail?.(t)}
                  title={`${t.tcId} — Lihat detail test case`}
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    fontWeight: 400,
                    color: "#94A3B8",
                    background: "none",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    textDecoration: "none",
                  }}
                >
                  {t.tcId}
                </button>
              </td>
              <td
                style={{
                  padding: "0.5rem 0.5rem",
                  width: "auto",
                  fontWeight: 500,
                  color: "#334155",
                  fontSize: 12,
                  userSelect: "text",
                  cursor: "default",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  textAlign: "left",
                }}
              >
                {t.title}
              </td>
              <td style={{ padding: "0.5rem 0.5rem", width: 144, textAlign: "left" }}>
                {/* Teks polos berwarna + chevron bawaan Select (sama seperti
                    dropdown Priority/Status) — bisa diubah langsung. Rata KIRI
                    supaya sejajar dengan judul kolomnya (kolom Opsi tetap tengah). */}
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "flex-start",
                    maxWidth: "100%",
                  }}
                >
                  <Select
                    size="sm"
                    value={t.type ?? ""}
                    disabled={!canEdit}
                    ariaLabel="Ubah type TC"
                    style={{
                      ...plainSelectStyle(typeTone(t.type)),
                      maxWidth: "100%",
                      width: "auto",
                      display: "inline-flex",
                    }}
                    onChange={(e) => {
                      const val = e.target.value;
                      onQuickUpdate(t, {
                        type: val === "POSITIVE" || val === "NEGATIVE" ? val : null,
                      });
                    }}
                  >
                    <option value="">— Belum dipilih —</option>
                    <option value="POSITIVE">Positive</option>
                    <option value="NEGATIVE">Negative</option>
                  </Select>
                </div>
              </td>
              <td style={{ padding: "0.5rem 0.5rem", width: 144, textAlign: "left" }}>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "flex-start",
                    maxWidth: "100%",
                  }}
                >
                  <Select
                    size="sm"
                    value={t.priority}
                    disabled={!canEdit}
                    ariaLabel="Ubah priority TC"
                    style={{
                      ...plainSelectStyle(priorityTone(t.priority)),
                      maxWidth: "100%",
                      // Menyusut ke konten agar bisa muncul rata tengah di sel.
                      width: "auto",
                      display: "inline-flex",
                    }}
                    onChange={(e) => {
                      const val = e.target.value as TestCase["priority"];
                      onQuickUpdate(t, { priority: val });
                    }}
                  >
                    <option value="CRITICAL">Critical</option>
                    <option value="HIGH">High</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="LOW">Low</option>
                  </Select>
                </div>
              </td>
              <td style={{ padding: "0.5rem 0.5rem", width: 144, textAlign: "left" }}>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "flex-start",
                    maxWidth: "100%",
                  }}
                >
                  <Select
                    size="sm"
                    value={t.status}
                    disabled={!canEdit}
                    ariaLabel="Ubah status TC"
                    style={{
                      ...plainSelectStyle(statusTone(t.status)),
                      maxWidth: "100%",
                      // Menyusut ke konten agar bisa muncul rata tengah di sel.
                      width: "auto",
                      display: "inline-flex",
                    }}
                    onChange={(e) => {
                      const val = e.target.value as TestCase["status"];
                      onQuickUpdate(t, { status: val });
                    }}
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="DRAFT">Draft</option>
                    <option value="DEPRECATED">Deprecated</option>
                  </Select>
                </div>
              </td>
              {canEdit && (
                <td style={{ padding: "0.5rem 0.5rem", textAlign: "center", width: 64 }}>
                  <div
                    // Kebab/action menu bukan bagian dari aksi "buka detail".
                    onClick={(e) => e.stopPropagation()}
                    style={{ display: "flex", justifyContent: "center", alignItems: "center" }}
                  >
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
