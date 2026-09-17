"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { FileVideo, Image as ImageIcon, Loader2, Paperclip, Trash2, X } from "lucide-react";
import {
  deleteAttachment,
  type AttachmentOwner,
} from "@/lib/actions/attachments";
import { uploadAttachmentFile } from "@/lib/client/attachments";
import { MAX_ATTACHMENT_BYTES } from "@/lib/storage/limits";
import type { AttachmentItem } from "@/types/api";

const MAX_MB = Math.round(MAX_ATTACHMENT_BYTES / 1024 / 1024);

const humanSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const isVideo = (mime: string) => mime.startsWith("video/");

/** Ambil file dari clipboard: `files` (salin dari file manager) atau `items` (screenshot). */
function filesFromClipboard(data: DataTransfer | null): File[] {
  if (!data) return [];
  const fromFiles = Array.from(data.files ?? []);
  if (fromFiles.length > 0) return fromFiles;
  return Array.from(data.items ?? [])
    .filter((it) => it.kind === "file")
    .map((it) => it.getAsFile())
    .filter((f): f is File => Boolean(f));
}

/**
 * Panel yang sedang ter-mount (paling bawah → paling atas). Paste hanya
 * ditangani panel PALING ATAS supaya satu Ctrl+V tidak mengunggah gambar yang
 * sama ke dua panel sekaligus — mis. modal Bug yang terbuka di atas modal
 * Eksekusi (keduanya memuat AttachmentsPanel).
 */
const mountedPanels: symbol[] = [];

/**
 * Panel attachment reusable: pilih file → presign → PUT langsung ke R2
 * (byte tidak lewat server) → konfirmasi metadata.
 *
 * Daftar attachment dicerminkan ke state lokal dan di-update IN-PLACE setelah
 * upload/hapus — tidak memanggil refetch halaman, supaya modal/tab tidak
 * ter-remount (dan posisi scroll tidak melompat).
 *
 * Dipakai di: tab Attachments Test Case, ExecutionModal (evidence run result),
 * dan modal evidence Bug.
 */
export function AttachmentsPanel({
  owner,
  attachments,
  canEdit = true,
  onChange,
  compact = false,
}: {
  owner: AttachmentOwner;
  attachments: AttachmentItem[];
  canEdit?: boolean;
  /** Dipanggil dengan daftar terbaru agar parent bisa ikut memperbarui
   *  penghitung/badge-nya tanpa refetch. */
  onChange?: (items: AttachmentItem[]) => void;
  /** Tampilan lebih rapat untuk di dalam modal. */
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  // Identitas panel di stack `mountedPanels` (untuk scoping paste).
  const panelIdRef = useRef(Symbol("attachments-panel"));
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<AttachmentItem | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  // Cermin lokal daftar attachment; prop tetap otoritatif saat berubah.
  const [items, setItems] = useState<AttachmentItem[]>(attachments);
  useEffect(() => {
    setItems(attachments);
  }, [attachments]);

  /** Update state lokal lalu beri tahu parent — tanpa refetch. */
  const applyItems = (next: AttachmentItem[]) => {
    setItems(next);
    onChange?.(next);
  };

  const pick = () => inputRef.current?.click();

  const handleFiles = async (files: FileList | File[] | null) => {
    const list = files ? Array.from(files) : [];
    if (list.length === 0) return;
    // Penjaga untuk semua jalur pemanggil (pilih, drop, paste).
    if (uploading) return;
    setError(null);
    // Kumpulkan hasil upload, baru terapkan sekali di akhir agar tidak
    // menimpa state dengan snapshot yang basi saat multi-file.
    const created: AttachmentItem[] = [];

    for (const file of list) {
      // Validasi awal di klien supaya tidak perlu round-trip untuk file jelas invalid.
      if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
        setError(`"${file.name}": hanya file gambar atau video yang diperbolehkan.`);
        continue;
      }
      if (file.size > MAX_ATTACHMENT_BYTES) {
        setError(`"${file.name}": ukuran melebihi ${MAX_MB} MB.`);
        continue;
      }

      setUploading(true);
      setProgress(0);
      const result = await uploadAttachmentFile(file, owner, setProgress);
      setUploading(false);
      setProgress(0);
      if (!result.ok) {
        setError(result.error);
        continue;
      }
      created.push(result.attachment);
    }

    if (inputRef.current) inputRef.current.value = "";
    // Tambahkan ke daftar lokal — TANPA refetch halaman.
    if (created.length > 0) applyItems([...created, ...items]);
  };

  /** Terima file yang di-drop ke area dashed. */
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (!canEdit || uploading) return;
    void handleFiles(e.dataTransfer.files);
  };

  // Versi terbaru `handleFiles` untuk listener document (dipasang sekali saat
  // mount) supaya closure-nya tidak basi soal `items`/`uploading`.
  const handleFilesRef = useRef(handleFiles);
  useEffect(() => {
    handleFilesRef.current = handleFiles;
  });

  /**
   * Ctrl/Cmd+V: unggah gambar/video dari clipboard, baik saat fokus di area
   * dropzone maupun di mana pun selama panel (modal) ini terbuka — event paste
   * dari elemen mana pun tetap bubble ke document.
   *
   * Paste teks ke input/textarea SENGAJA dilewatkan: clipboard dari Excel/Word
   * bisa membawa teks sekaligus rendition gambar, dan menempel teks tidak boleh
   * berubah jadi upload evidence.
   */
  useEffect(() => {
    if (!canEdit) return;
    const id = panelIdRef.current;
    mountedPanels.push(id);

    const onPaste = (e: ClipboardEvent) => {
      // Hanya panel paling atas yang menangani (lihat `mountedPanels`).
      if (mountedPanels[mountedPanels.length - 1] !== id) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || target?.isContentEditable) return;

      const files = filesFromClipboard(e.clipboardData);
      if (files.length === 0) return;
      e.preventDefault();
      void handleFilesRef.current(files);
    };

    document.addEventListener("paste", onPaste);
    return () => {
      document.removeEventListener("paste", onPaste);
      const i = mountedPanels.indexOf(id);
      if (i >= 0) mountedPanels.splice(i, 1);
    };
  }, [canEdit]);

  const remove = async (att: AttachmentItem) => {
    setDeletingId(att.id);
    setError(null);
    const res = await deleteAttachment(att.id);
    setDeletingId(null);
    if (res.error) {
      setError(res.error);
      return;
    }
    // Buang dari daftar lokal — TANPA refetch halaman.
    applyItems(items.filter((a) => a.id !== att.id));
  };

  /** Thumbnail ringkas 64×64 di dalam kartu mini evidence. */
  const thumbMediaStyle: CSSProperties = {
    width: 64,
    height: 64,
    borderRadius: 8,
    border: "1px solid var(--border)",
    display: "block",
    objectFit: "cover",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        style={{ display: "none" }}
        onChange={(e) => void handleFiles(e.target.files)}
      />

      {/* Dropzone hanya tampil saat belum ada file. Setelah ada file, yang
          tampil cukup preview + tombol "Ubah file" yang ringkas. */}
      {canEdit && items.length === 0 && (
        <div
          role="button"
          tabIndex={0}
          aria-label="Upload evidence"
          onClick={pick}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              pick();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            if (!uploading) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.3rem",
            padding: compact ? "0.9rem 1rem" : "1.25rem 1rem",
            borderRadius: 8,
            border: `2px dashed ${dragging ? "#94A3B8" : "#CBD5E1"}`,
            background: dragging ? "#F1F5F9" : "#F8FAFC",
            cursor: uploading ? "wait" : "pointer",
            textAlign: "center",
            transition: "background-color 0.15s ease, border-color 0.15s ease",
          }}
          onMouseEnter={(e) => {
            if (!dragging && !uploading) e.currentTarget.style.background = "#F1F5F9";
          }}
          onMouseLeave={(e) => {
            if (!dragging) e.currentTarget.style.background = "#F8FAFC";
          }}
        >
          {uploading ? (
            <>
              <Loader2
                size={18}
                style={{ color: "#64748B", animation: "spin 0.8s linear infinite" }}
              />
              <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "#334155" }}>
                Mengunggah… {progress}%
              </span>
            </>
          ) : (
            <>
              <Paperclip size={18} style={{ color: "#94A3B8" }} />
              <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "#334155" }}>
                Klik, Drag, atau Paste file di sini
              </span>
              <span style={{ fontSize: "0.7rem", color: "#94A3B8" }}>
                Gambar atau video · maks {MAX_MB} MB per file
              </span>
            </>
          )}
        </div>
      )}

      {/* Sedang mengunggah file tambahan saat daftar sudah berisi. */}
      {canEdit && items.length > 0 && uploading && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
            fontSize: "0.76rem",
            fontWeight: 600,
            color: "#334155",
          }}
        >
          <Loader2 size={14} style={{ color: "#64748B", animation: "spin 0.8s linear infinite" }} />
          Mengunggah… {progress}%
        </div>
      )}

      {error && (
        <div
          style={{
            fontSize: "0.78rem",
            color: "var(--danger)",
            background: "var(--danger-bg)",
            border: "1px solid #FECACA",
            borderRadius: 8,
            padding: "0.45rem 0.7rem",
          }}
        >
          {error}
        </div>
      )}

      {items.length === 0 ? (
        // Untuk pengunggah, dropzone di atas sudah menjelaskan keadaannya —
        // tidak perlu teks tambahan. Teks ini untuk yang hanya bisa melihat.
        !canEdit && (
          <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--text-muted)" }}>
            Belum ada attachment.
          </p>
        )
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
          {/* Tombol ringkas untuk menambah/mengganti file — dropzone besar
              sudah disembunyikan karena daftar sudah berisi. */}
          {canEdit && (
            <div>
              <button
                type="button"
                onClick={pick}
                disabled={uploading}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.3rem",
                  padding: 0,
                  border: "none",
                  background: "transparent",
                  color: "#2563EB",
                  fontSize: "0.76rem",
                  fontWeight: 600,
                  cursor: uploading ? "wait" : "pointer",
                }}
              >
                <Paperclip size={12} /> Tambah / ubah file
              </button>
            </div>
          )}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "flex-start",
              gap: compact ? "0.6rem" : "0.75rem",
            }}
          >
            {items.map((att) => {
              const video = isVideo(att.mimeType);
              const openable = Boolean(att.url);
              return (
                <div
                  key={att.id}
                  style={{
                    position: "relative",
                    width: 116,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "0.3rem",
                    padding: "0.5rem 0.5rem 0.55rem",
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    background: "#fff",
                  }}
                >
                  {openable && !video ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={att.url!}
                      alt={att.fileName}
                      onClick={() => setPreview(att)}
                      style={{ ...thumbMediaStyle, cursor: "zoom-in" }}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => (att.url ? window.open(att.url, "_blank") : undefined)}
                      title={att.url ? att.fileName : "URL tidak tersedia"}
                      style={{
                        ...thumbMediaStyle,
                        background: "var(--surface-muted)",
                        cursor: openable ? "pointer" : "default",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#94A3B8",
                        // `display: block` dari thumbMediaStyle diganti agar ikon terpusat.
                        display: "flex",
                      }}
                    >
                      {video ? <FileVideo size={22} /> : <ImageIcon size={22} />}
                    </button>
                  )}

                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => void remove(att)}
                      disabled={deletingId === att.id}
                      title="Hapus attachment"
                      aria-label={`Hapus ${att.fileName}`}
                      className="icon-btn-circle"
                      style={{
                        position: "absolute",
                        top: 6,
                        right: 6,
                        width: 24,
                        height: 24,
                        padding: 4,
                        borderRadius: "50%",
                        border: "none",
                        background: "#F43F5E",
                        color: "#fff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        boxShadow: "0 1px 4px rgba(15, 23, 42, 0.25)",
                        cursor: deletingId === att.id ? "wait" : "pointer",
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  )}

                  {/* Nama file + ukuran, di bawah thumbnail kartu */}
                  <div
                    title={att.fileName}
                    style={{
                      width: "100%",
                      textAlign: "center",
                      fontSize: "0.72rem",
                      fontWeight: 600,
                      color: "#1F2937",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {att.fileName}
                  </div>
                  <div style={{ fontSize: "0.66rem", color: "var(--text-muted)" }}>
                    {humanSize(att.size)}
                  </div>
                  {video && openable && (
                    <a
                      href={att.url!}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        fontSize: "0.7rem",
                        color: "#2563EB",
                        textDecoration: "none",
                      }}
                    >
                      Buka video
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Preview gambar ukuran penuh */}
      {preview && preview.url && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={preview.fileName}
          onClick={() => setPreview(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 400,
            background: "rgba(0,0,0,0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "2rem",
          }}
        >
          <button
            type="button"
            onClick={() => setPreview(null)}
            aria-label="Tutup"
            style={{
              position: "absolute",
              top: "1rem",
              right: "1rem",
              width: 34,
              height: 34,
              borderRadius: 8,
              border: "none",
              background: "rgba(255,255,255,0.15)",
              color: "#fff",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <X size={18} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview.url}
            alt={preview.fileName}
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "90%", maxHeight: "90%", borderRadius: 8, objectFit: "contain" }}
          />
        </div>
      )}
    </div>
  );
}
