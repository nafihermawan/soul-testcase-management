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
 *
 * Tiga hal yang menentukan kecepatan pipeline ini:
 *  1. PASS-THROUGH. MP4/H.264 di bawah `PASSTHROUGH_MAX_BYTES` TIDAK di-encode
 *     sama sekali — file seperti ini sudah kecil dan sudah bisa diputar browser,
 *     jadi encode ulang hanya membuang waktu (inilah penyebab "13 MB tapi lama").
 *  2. PRESET `ultrafast` — paling cepat dari preset yang diizinkan spesifikasi.
 *  3. ANTREAN satu-lintasan. Instance ffmpeg.wasm itu singleton dan MEMFS-nya
 *     dipakai bersama, jadi dua kompresi yang jalan bersamaan akan saling
 *     menimpa `input.*`/`output.mp4`.
 *
 * Proses encoding berjalan di Web Worker milik ffmpeg.wasm, jadi thread UI tidak
 * diblokir; progresnya diteruskan ke UI lewat `onProgress`.
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
/** CRF 28 (batas atas rentang 24–28): masih jelas untuk evidence, ukuran paling kecil. */
const CRF = "28";
/**
 * `ultrafast` (bukan `veryfast`): preset ini yang memberi selisih waktu paling
 * besar di core single-thread, dan file evidence tidak butuh efisiensi bitrate.
 */
const PRESET = "ultrafast";
const AUDIO_BITRATE = "96k";

/**
 * Ambang pass-through (15 MB). Di bawah ambang ini file MP4/H.264 dianggap
 * sudah "cukup kecil" dan dilewati. Angka ini sejalan dengan batas upload
 * bukti QA sehari-hari (video 10–20 detik hasil rekaman HP).
 */
const PASSTHROUGH_MAX_BYTES = 15 * 1024 * 1024;

/** Fourcc sample entry H.264 di dalam `stsd`. */
const H264_CODECS = ["avc1", "avc3"];

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

/* ------------------------------------------------------------------ *
 * Probe container/codec (untuk pass-through)                          *
 * ------------------------------------------------------------------ */

/** uint32 big-endian — semua ukuran box MP4 big-endian. */
function readU32(bytes: Uint8Array, at: number): number {
  return ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;
}

/** Empat huruf tipe box (mis. "moov") mulai dari `at`. */
function readFourcc(bytes: Uint8Array, at: number): string {
  return String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);
}

/** Posisi ASCII `needle` di rentang `from`–`to`, atau -1 bila tidak ada. */
function indexOfAscii(bytes: Uint8Array, needle: string, from: number, to: number): number {
  const last = Math.min(to, bytes.byteLength) - needle.length;
  for (let i = Math.max(0, from); i <= last; i++) {
    let hit = true;
    for (let j = 0; j < needle.length; j++) {
      if (bytes[i + j] !== needle.charCodeAt(j)) {
        hit = false;
        break;
      }
    }
    if (hit) return i;
  }
  return -1;
}

/**
 * Tentukan codec video sebuah MP4 TANPA ffprobe: telusuri box TOP-LEVEL untuk
 * menemukan `moov` (di AWAL kalau file faststart, di AKHIR kalau hasil rekaman
 * HP), lalu ambil fourcc sample entry pertama di dalam `stsd` — `avc1`/`avc3`
 * untuk H.264, `hvc1`/`hev1` untuk H.265, `vp09`, `av01`, dan seterusnya.
 *
 * `null` berarti bukan MP4 atau strukturnya tidak terbaca; pemanggil
 * memperlakukannya sebagai "tidak aman dilewati" sehingga tetap di-encode.
 *
 * Diekspor supaya bisa diuji langsung (lihat `video-compress.test.ts`).
 */
export function probeMp4VideoCodec(bytes: Uint8Array): string | null {
  if (bytes.byteLength < 16 || readFourcc(bytes, 4) !== "ftyp") return null;

  let offset = 0;
  while (offset + 8 <= bytes.byteLength) {
    const size = readU32(bytes, offset);
    const type = readFourcc(bytes, offset + 4);

    if (type === "moov") {
      const end = size === 0 ? bytes.byteLength : Math.min(bytes.byteLength, offset + size);
      // stsd: [size(4)][type(4)][version+flags(4)][entry_count(4)][size(4)][format(4)]
      // yang ditemukan `indexOfAscii` adalah field TYPE-nya, jadi fourcc sample
      // entry pertama ada di +16 (dari posisi "stsd" itu).
      const stsd = indexOfAscii(bytes, "stsd", offset + 8, end);
      if (stsd < 0 || stsd + 20 > bytes.byteLength) return null;
      return readFourcc(bytes, stsd + 16);
    }

    // size 0 = box terakhir (sampai EOF); size 1 = ukuran 64-bit, diabaikan.
    if (size < 8) return null;
    offset += size;
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Antrean satu-lintasan                                               *
 * ------------------------------------------------------------------ */

let compressionQueue: Promise<unknown> = Promise.resolve();

/**
 * Jalankan `job` setelah kompresi sebelumnya selesai. Antreannya sengaja tidak
 * pernah "putus" oleh kegagalan — satu video gagal tidak boleh menyandera
 * video berikutnya.
 */
function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = compressionQueue.then(job, job);
  compressionQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

/* ------------------------------------------------------------------ *
 * Pipeline                                                            *
 * ------------------------------------------------------------------ */

/** Isi ffmpeg: tulis input, encode (dengan filter cadangan), baca hasil. */
async function encodeVideo(
  file: File,
  bytes: Uint8Array,
  onProgress: ((percent: number) => void) | undefined,
  asIs: VideoCompressResult
): Promise<VideoCompressResult> {
  const tCore = performance.now();
  const ffmpeg = await getFFmpeg();
  console.info(`[video] core ffmpeg siap dalam ${Math.round(performance.now() - tCore)} ms`);

  const input = inputName(file);
  await ffmpeg.writeFile(input, bytes);

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
    const tEncode = performance.now();
    let ok = await run(SCALE_BOX);
    if (!ok) {
      // Bersihkan output parsial sebelum mencoba dengan filter cadangan.
      await ffmpeg.deleteFile("output.mp4").catch(() => {});
      ok = await run(SCALE_FALLBACK);
    }
    const encodeMs = Math.round(performance.now() - tEncode);
    if (!ok) {
      // Dua-duanya gagal: bebaskan MEMFS lalu unggah file aslinya.
      await ffmpeg.deleteFile(input).catch(() => {});
      await ffmpeg.deleteFile("output.mp4").catch(() => {});
      console.warn(`[video] encode gagal setelah ${encodeMs} ms — file asli diunggah`);
      return asIs;
    }

    const tRead = performance.now();
    const data = await ffmpeg.readFile("output.mp4");
    const readMs = Math.round(performance.now() - tRead);
    // Bebaskan MEMFS; kegagalan hapus tidak boleh menggagalkan upload.
    await ffmpeg.deleteFile(input).catch(() => {});
    await ffmpeg.deleteFile("output.mp4").catch(() => {});

    if (!(data instanceof Uint8Array) || data.byteLength === 0) return asIs;
    // Guard: hasil yang tidak lebih kecil tidak layak menggantikan aslinya.
    if (data.byteLength >= file.size) {
      console.info(
        `[video] hasil (${(data.byteLength / 1048576).toFixed(1)} MB) tidak lebih kecil — file asli diunggah`
      );
      return asIs;
    }

    console.info(
      `[video] encode ${encodeMs} ms (baca hasil ${readMs} ms), preset ${PRESET} crf ${CRF}`
    );

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

  // Diagnostik durasi total pipeline (dipakai untuk membandingkan sebelum/
  // sesudah optimasi: pass-through vs encode).
  console.time("video-compression");
  console.info(
    `[video] mulai: ${file.name} — ${(file.size / 1048576).toFixed(1)} MB (${file.type || "tipe tak dikenal"})`
  );

  try {
    // Dibaca sekali: byte ini dipakai probe container DAN (kalau perlu) MEMFS.
    const bytes = new Uint8Array(await file.arrayBuffer());

    // 3) Pass-through: MP4/H.264 yang sudah kecil tidak di-encode sama sekali.
    if (file.size < PASSTHROUGH_MAX_BYTES) {
      const codec = probeMp4VideoCodec(bytes);
      if (codec && H264_CODECS.includes(codec)) {
        console.info(
          `[video] DILEWATI (pass-through): container MP4/${codec} dan ${(
            file.size / 1048576
          ).toFixed(1)} MB < ${PASSTHROUGH_MAX_BYTES / 1048576} MB`
        );
        return asIs;
      }
      console.info(`[video] perlu di-encode: codec terdeteksi ${codec ?? "tidak diketahui"}`);
    } else {
      console.info(
        `[video] perlu di-encode: ${(file.size / 1048576).toFixed(1)} MB ≥ ambang pass-through ${
          PASSTHROUGH_MAX_BYTES / 1048576
        } MB`
      );
    }

    // 2) Antrean: satu kompresi pada satu waktu (instance ffmpeg singleton).
    return await enqueue(() => encodeVideo(file, bytes, onProgress, asIs));
  } catch (error) {
    console.warn("Kompresi video dilewati (ffmpeg.wasm tidak siap):", error);
    return asIs;
  } finally {
    console.timeEnd("video-compression");
  }
}
