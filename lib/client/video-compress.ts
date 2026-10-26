/**
 * Kompresi video di BROWSER (ffmpeg.wasm), dijalankan SEBELUM upload ke R2.
 *
 * Kenapa di klien: byte attachment tidak pernah lewat server
 * (`presignAttachmentUpload` → browser PUT langsung ke R2), jadi satu-satunya
 * titik yang bisa mengecilkan video adalah sebelum PUT itu. Semua jalur upload
 * melewati `lib/client/attachments.ts`, jadi pemasangan di sana menutup panel
 * Evidence, form Bug, dan modal Eksekusi sekaligus.
 *
 * Memakai core **single-thread** (`@ffmpeg/core`, bukan `core-mt`) supaya tidak
 * butuh `SharedArrayBuffer` — versi mt mewajibkan header COOP/COEP di seluruh
 * app, yang justru berisiko memblokir resource cross-origin (presigned R2).
 */

import type { FFmpeg } from "@ffmpeg/ffmpeg";

/**
 * Batas kotak keluaran: SISI TERPANJANG ≤ 1280 — artinya 720p untuk video
 * 16:9 dan 720×1280 untuk video portrait. Video yang lebih kecil dibiarkan
 * apa adanya (tidak pernah di-upscale).
 *
 * Sudah diuji langsung ke core 0.12.10 (ffmpeg 5.1.4) yang sama dengan yang
 * dipakai browser: 1920×1080 → 1280×720, 1080×1920 → 720×1280,
 * 1440×1080 → 1280×960.
 */
const MAX_W = 1280;
const MAX_H = 1280;
/** CRF 28: masih jelas untuk evidence, penurunan ukuran paling besar. */
const CRF = "28";
const PRESET = "veryfast";
const AUDIO_BITRATE = "96k";

/**
 * Core ffmpeg.wasm dari CDN (di-cache `max-age=31536000` oleh browser). Salah
 * satu sumber yang punya CORS `*`. Kalau nanti mau self-host, cukup ganti path
 * ini ke berkas di `public/`.
 */
const CORE_BASE = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd";

/**
 * Ekspresi scale utama. `force_divisible_by=2` penting: H.264 + `yuv420p`
 * menolak dimensi ganjil, sedangkan pembulatan aspect ratio bisa
 * menghasilkannya (mis. 719 px).
 */
const SCALE_BOX = `scale=w='min(${MAX_W},iw)':h='min(${MAX_H},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2`;

/**
 * Cadangan: ekspresi yang sama TANPA `force_divisible_by`, dipakai kalau build
 * core menolak opsi tersebut. Hasilnya sudah diuji identik dengan yang utama.
 */
const SCALE_FALLBACK = `scale=w='min(${MAX_W},iw)':h='min(${MAX_H},ih)':force_original_aspect_ratio=decrease`;

export type VideoCompressResult = {
  /** File yang siap diunggah — hasil kompresi, atau file ASLI bila dilewati. */
  file: File;
  /** `true` hanya bila byte-nya benar-benar lebih kecil dari aslinya. */
  compressed: boolean;
};

let ffmpegPromise: Promise<FFmpeg> | null = null;

/**
 * Muat core ffmpeg SEKALI per sesi (±31 MB, selanjutnya dilayani cache
 * browser). Kegagalan tidak di-cache supaya percobaan upload berikutnya masih
 * bisa mencoba lagi.
 */
function getFFmpeg(): Promise<FFmpeg> {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      const [{ FFmpeg: FFmpegClass }, { toBlobURL }] = await Promise.all([
        import("@ffmpeg/ffmpeg"),
        import("@ffmpeg/util"),
      ]);
      const ffmpeg = new FFmpegClass();
      const coreURL = await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, "text/javascript");
      const wasmURL = await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, "application/wasm");
      await ffmpeg.load({ coreURL, wasmURL });
      // Instance sudah terbentuk, jadi kedua blob tidak dibutuhkan lagi —
      // dilepas agar tidak menahan ±31 MB memori tab ini.
      URL.revokeObjectURL(coreURL);
      URL.revokeObjectURL(wasmURL);
      return ffmpeg;
    })().catch((error) => {
      ffmpegPromise = null;
      throw error;
    });
  }
  return ffmpegPromise;
}

/** Nama file di MEMFS — hanya butuh ekstensi agar demuxer tahu container-nya. */
function inputName(file: File): string {
  const match = /\.([a-z0-9]{2,5})$/i.exec(file.name);
  return `input.${match ? match[1].toLowerCase() : "bin"}`;
}

/** Nama file hasil: ekstensi diganti `.mp4` karena container outputnya MP4. */
function outputName(file: File): string {
  const base = file.name.replace(/\.[^./\\]+$/, "").trim() || "video";
  return `${base}.mp4`;
}

function ffmpegArgs(input: string, scale: string): string[] {
  return [
    "-i",
    input,
    "-c:v",
    "libx264",
    "-preset",
    PRESET,
    "-crf",
    CRF,
    "-pix_fmt",
    "yuv420p",
    "-vf",
    scale,
    // Video tanpa audio tetap aman: encoder audio hanya dipakai bila ada stream-nya.
    "-c:a",
    "aac",
    "-b:a",
    AUDIO_BITRATE,
    "-movflags",
    "+faststart",
    "output.mp4",
  ];
}

/**
 * Kompres satu file video. Selalu mengembalikan file yang bisa diunggah:
 * kalau kompresi gagal, tidak didukung, atau hasilnya tidak lebih kecil, file
 * ASLI dikembalikan — upload tidak boleh batal hanya karena kompresi.
 *
 * `onProgress` menerima 0–100 dari ffmpeg (progres encoding, bukan download core).
 */
export async function compressVideoFile(
  file: File,
  onProgress?: (percent: number) => void
): Promise<VideoCompressResult> {
  const asIs: VideoCompressResult = { file, compressed: false };
  if (!file.type.startsWith("video/")) return asIs;

  try {
    const ffmpeg = await getFFmpeg();
    const input = inputName(file);
    await ffmpeg.writeFile(input, new Uint8Array(await file.arrayBuffer()));

    const handleProgress = (event: { progress: number }) => {
      // ffmpeg kadang melaporkan sedikit lebih dari 1 — dipangkas agar label rapi.
      const percent = Math.max(0, Math.min(100, Math.round(event.progress * 100)));
      onProgress?.(percent);
    };
    ffmpeg.on("progress", handleProgress);

    /** Satu percobaan encoding; `false` berarti gagal (exception dari core). */
    const run = async (scale: string): Promise<boolean> => {
      try {
        await ffmpeg.exec(ffmpegArgs(input, scale));
        return true;
      } catch (error) {
        console.warn("ffmpeg gagal dengan filter", scale, error);
        return false;
      }
    };

    try {
      let ok = await run(SCALE_BOX);
      if (!ok) {
        // Bersihkan output parsial sebelum mencoba dengan filter cadangan.
        await ffmpeg.deleteFile("output.mp4").catch(() => {});
        ok = await run(SCALE_FALLBACK);
      }
      if (!ok) {
        // Dua-duanya gagal: bebaskan MEMFS lalu unggah file aslinya.
        await ffmpeg.deleteFile(input).catch(() => {});
        await ffmpeg.deleteFile("output.mp4").catch(() => {});
        return asIs;
      }

      const data = await ffmpeg.readFile("output.mp4");
      // Bebaskan MEMFS; kegagalan hapus tidak boleh menggagalkan upload.
      await ffmpeg.deleteFile(input).catch(() => {});
      await ffmpeg.deleteFile("output.mp4").catch(() => {});

      if (!(data instanceof Uint8Array) || data.byteLength === 0) return asIs;
      // Guard: hasil yang tidak lebih kecil tidak layak menggantikan aslinya.
      if (data.byteLength >= file.size) return asIs;

      const compressed = new File(
        // `readFile` selalu view atas ArrayBuffer biasa; tipe `FileData` di
        // ffmpeg.wasm masih `Uint8Array<ArrayBufferLike>` sehingga perlu dipersempit.
        [data as Uint8Array<ArrayBuffer>],
        outputName(file),
        { type: "video/mp4", lastModified: Date.now() }
      );
      console.info(
        `Video dikompres: ${(file.size / 1048576).toFixed(1)} MB → ${(
          compressed.size / 1048576
        ).toFixed(1)} MB`
      );
      return { file: compressed, compressed: true };
    } finally {
      ffmpeg.off("progress", handleProgress);
    }
  } catch (error) {
    console.warn("Kompresi video dilewati (ffmpeg.wasm tidak siap):", error);
    return asIs;
  }
}
