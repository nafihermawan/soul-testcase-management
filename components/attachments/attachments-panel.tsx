"use client";

import { useRef, useState, type CSSProperties } from "react";
import { FileVideo, Image as ImageIcon, Loader2, Paperclip, Trash2, X } from "lucide-react";
import {
  confirmAttachment,
  deleteAttachment,
  presignAttachmentUpload,
  type AttachmentOwner,
} from "@/lib/actions/attachments";
import { MAX_ATTACHMENT_BYTES } from "@/lib/storage/limits";
import type { AttachmentItem } from "@/types/api";

const MAX_MB = Math.round(MAX_ATTACHMENT_BYTES / 1024 / 1024);

const humanSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const isVideo = (mime: string) => mime.startsWith("video/");

/**
 * Panel attachment reusable: pilih file → presign → PUT langsung ke R2
 * (byte tidak lewat server) → konfirmasi metadata → refresh.
 *
 * Dipakai di: tab Attachments Test Case, ExecutionModal (evidence run result),
 * dan modal evidence Bug.
 */
export function AttachmentsPanel({
  owner,
  attachments,
  canEdit = true,
  onChanged,
  compact = false,
}: {
  owner: AttachmentOwner;
  attachments: AttachmentItem[];
  canEdit?: boolean;
  onChanged?: () => void;
  /** Tampilan lebih rapat untuk di dalam modal. */
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<AttachmentItem | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const pick = () => inputRef.current?.click();

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);
    let uploadedCount = 0;

    for (const file of Array.from(files)) {
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
      try {
        const presign = await presignAttachmentUpload({
          fileName: file.name,
          mimeType: file.type,
          size: file.size,
          owner,
        });
        if (presign.error || !presign.uploadUrl || !presign.storageKey) {
          setError(presign.error ?? "Gagal menyiapkan upload.");
          continue;
        }

        // PUT langsung ke R2 — pakai XHR agar progres upload bisa ditampilkan
        // (fetch tidak menyediakan progress upload).
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("PUT", presign.uploadUrl!);
          xhr.setRequestHeader("Content-Type", file.type);
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
          };
          xhr.onload = () =>
            xhr.status >= 200 && xhr.status < 300
              ? resolve()
              : reject(new Error(`Upload gagal (HTTP ${xhr.status}).`));
          xhr.onerror = () => reject(new Error("Upload gagal — periksa koneksi."));
          xhr.send(file);
        });

        const confirmed = await confirmAttachment({
          storageKey: presign.storageKey,
          fileName: file.name,
          mimeType: file.type,
          size: file.size,
          owner,
        });
        if (confirmed.error) {
          setError(confirmed.error);
          continue;
        }
        uploadedCount++;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload gagal.");
      } finally {
        setUploading(false);
        setProgress(0);
      }
    }

    if (inputRef.current) inputRef.current.value = "";
    // Hanya reload bila ada yang benar-benar ter-upload — memanggil reload saat
    // file ditolak akan me-remount panel dan menghapus pesan errornya.
    if (uploadedCount > 0) onChanged?.();
  };

  const remove = async (att: AttachmentItem) => {
    setDeletingId(att.id);
    setError(null);
    const res = await deleteAttachment(att.id);
    setDeletingId(null);
    if (res.error) {
      setError(res.error);
      return;
    }
    onChanged?.();
  };

  const tileStyle: CSSProperties = {
    position: "relative",
    width: compact ? 84 : 104,
    height: compact ? 84 : 104,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--surface-muted)",
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
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

      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
        {canEdit && (
          <button
            type="button"
            onClick={pick}
            disabled={uploading}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.35rem",
              padding: "0.45rem 0.9rem",
              borderRadius: 8,
              border: "none",
              background: "#F59E0B",
              color: "#1F2937",
              fontWeight: 600,
              fontSize: "0.82rem",
              cursor: uploading ? "wait" : "pointer",
            }}
          >
            {uploading ? (
              <>
                <Loader2 size={14} style={{ animation: "spin 0.8s linear infinite" }} />
                Mengunggah… {progress}%
              </>
            ) : (
              <>
                <Paperclip size={14} /> Attach File
              </>
            )}
          </button>
        )}
        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
          Gambar atau video · maks {MAX_MB} MB per file
        </span>
      </div>

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

      {attachments.length === 0 ? (
        <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--text-muted)" }}>
          Belum ada attachment.
        </p>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.6rem" }}>
          {attachments.map((att) => (
            <div key={att.id} style={tileStyle}>
              {att.url && !isVideo(att.mimeType) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={att.url}
                  alt={att.fileName}
                  onClick={() => setPreview(att)}
                  style={{ width: "100%", height: "100%", objectFit: "cover", cursor: "zoom-in" }}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => (att.url ? window.open(att.url, "_blank") : undefined)}
                  title={att.url ? att.fileName : "URL tidak tersedia"}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "0.25rem",
                    border: "none",
                    background: "transparent",
                    cursor: att.url ? "pointer" : "default",
                    color: "var(--text-muted)",
                    padding: "0.25rem",
                  }}
                >
                  {isVideo(att.mimeType) ? <FileVideo size={22} /> : <ImageIcon size={22} />}
                  <span
                    style={{
                      fontSize: "0.62rem",
                      maxWidth: 78,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {att.fileName}
                  </span>
                  <span style={{ fontSize: "0.6rem" }}>{humanSize(att.size)}</span>
                </button>
              )}

              {canEdit && (
                <button
                  type="button"
                  onClick={() => void remove(att)}
                  disabled={deletingId === att.id}
                  title="Hapus attachment"
                  style={{
                    position: "absolute",
                    top: 3,
                    right: 3,
                    width: 22,
                    height: 22,
                    borderRadius: 6,
                    border: "none",
                    background: "rgba(17,24,39,0.72)",
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: deletingId === att.id ? "wait" : "pointer",
                  }}
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          ))}
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
