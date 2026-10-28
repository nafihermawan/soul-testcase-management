import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Jejak + brittle-free stub ffmpeg: modul aslinya singleton, jadi tiap test
 * me-reset module registry dulu supaya core-nya "dimuat" dari nol.
 */
const h = vi.hoisted(() => ({
  calls: [] as string[],
  lastExec: [] as string[],
  output: new Uint8Array([1, 2, 3]),
  execDelay: 0,
}));

vi.mock("@ffmpeg/ffmpeg", () => ({
  FFmpeg: class {
    async load() {
      h.calls.push("load");
    }
    async writeFile(name: string) {
      h.calls.push(`write:${name}`);
    }
    async exec(args: string[]) {
      h.lastExec = args;
      h.calls.push("exec");
      if (h.execDelay) await new Promise((r) => setTimeout(r, h.execDelay));
    }
    async readFile() {
      h.calls.push("read");
      return h.output;
    }
    async deleteFile(name: string) {
      h.calls.push(`delete:${name}`);
    }
    on() {
      h.calls.push("on");
    }
    off() {
      h.calls.push("off");
    }
  },
}));

vi.mock("@ffmpeg/util", () => ({
  toBlobURL: async () => URL.createObjectURL(new Blob([])),
}));

/* ------------------------------------------------------------------ *
 * Pembangun MP4 sintetis                                              *
 * ------------------------------------------------------------------ */

/** Susun satu box MP4: [size(4)][type(4)][payload]. */
function box(type: string, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + payload.length);
  const size = out.length;
  out[0] = (size >>> 24) & 255;
  out[1] = (size >>> 16) & 255;
  out[2] = (size >>> 8) & 255;
  out[3] = size & 255;
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(payload, 8);
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** `ftyp` minimal, major brand "isom". */
function ftyp(): Uint8Array {
  const payload = new Uint8Array(12);
  "isom".split("").forEach((ch, i) => (payload[i] = ch.charCodeAt(0)));
  return box("ftyp", payload);
}

/** `moov → trak → mdia → minf → stbl → stsd → <sample entry codec>`. */
function moovWith(codec: string): Uint8Array {
  const entry = box(codec, new Uint8Array(16)); // field sample entry; probe tidak membacanya
  const stsdPayload = concat(new Uint8Array(8), entry);
  stsdPayload[7] = 1; // entry_count = 1
  const trak = box("trak", box("mdia", box("minf", box("stbl", box("stsd", stsdPayload)))));
  return box("moov", trak);
}

/** MP4 sintetis dengan padding `padBytes` supaya ukurannya bisa diatur. */
function mp4(codec: string, padBytes: number): Uint8Array {
  return concat(ftyp(), moovWith(codec), box("mdat", new Uint8Array(padBytes)));
}

function videoFile(bytes: Uint8Array, name = "bukti.mp4"): File {
  return new File([bytes as Uint8Array<ArrayBuffer>], name, { type: "video/mp4" });
}

/** File WebM sintetis: magic EBML + padding (isi stream tidak dibaca probe). */
function webm(padBytes: number): Uint8Array {
  const out = new Uint8Array(4 + padBytes);
  out.set([0x1a, 0x45, 0xdf, 0xa3]);
  return out;
}

async function loadModule() {
  return await import("./video-compress");
}

beforeEach(() => {
  h.calls.length = 0;
  h.lastExec = [];
  h.output = new Uint8Array([1, 2, 3]);
  h.execDelay = 0;
  vi.resetModules();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "time").mockImplementation(() => {});
  vi.spyOn(console, "timeEnd").mockImplementation(() => {});
});

describe("probeMp4VideoCodec", () => {
  it("membaca H.264 saat moov di AWAL (faststart)", async () => {
    const { probeMp4VideoCodec } = await loadModule();
    expect(probeMp4VideoCodec(mp4("avc1", 64))).toBe("avc1");
  });

  it("membaca H.264 saat moov di AKHIR (rekaman HP)", async () => {
    const { probeMp4VideoCodec } = await loadModule();
    const moovAtEnd = concat(ftyp(), box("mdat", new Uint8Array(64)), moovWith("avc1"));
    expect(probeMp4VideoCodec(moovAtEnd)).toBe("avc1");
  });

  it("mengenali varian H.264 dan H.265", async () => {
    const { probeMp4VideoCodec } = await loadModule();
    expect(probeMp4VideoCodec(mp4("avc3", 64))).toBe("avc3");
    expect(probeMp4VideoCodec(mp4("hvc1", 64))).toBe("hvc1");
    expect(probeMp4VideoCodec(mp4("av01", 64))).toBe("av01");
  });

  it("mengenali container WebM dari magic EBML-nya", async () => {
    const { isWebmContainer } = await loadModule();
    expect(isWebmContainer(webm(32))).toBe(true);
    expect(isWebmContainer(mp4("avc1", 32))).toBe(false);
    expect(isWebmContainer(new Uint8Array(4))).toBe(false);
  });

  it("mengembalikan null untuk non-MP4 / data rusak / terlalu pendek", async () => {
    const { probeMp4VideoCodec } = await loadModule();
    expect(
      probeMp4VideoCodec(concat(box("mdat", new Uint8Array(64)), moovWith("avc1")))
    ).toBeNull();
    expect(probeMp4VideoCodec(new Uint8Array(64))).toBeNull();
    expect(probeMp4VideoCodec(new Uint8Array(8))).toBeNull();
    expect(probeMp4VideoCodec(concat(ftyp(), box("mdat", new Uint8Array(64))))).toBeNull();
  });
});

describe("compressVideoFile", () => {
  it("PASS-THROUGH: MP4/H.264 di bawah ambang tidak menyentuh ffmpeg", async () => {
    const { compressVideoFile } = await loadModule();
    const file = videoFile(mp4("avc1", 1_000_000));

    const result = await compressVideoFile(file);

    expect(result.compressed).toBe(false);
    expect(result.file).toBe(file); // file ASLI, bukan salinan
    expect(h.calls).toEqual([]); // core tidak pernah dimuat, tidak ada exec
  });

  it("PASS-THROUGH: WebM di bawah ambang juga dilewati (format rekaman layar QA)", async () => {
    const { compressVideoFile } = await loadModule();
    const file = new File([webm(2_000_000) as Uint8Array<ArrayBuffer>], "screencast.webm", {
      type: "video/webm",
    });

    const result = await compressVideoFile(file);

    expect(result.compressed).toBe(false);
    expect(result.file).toBe(file);
    expect(h.calls).toEqual([]);
  });

  it("file non-H.264 di-encode dengan preset/CRF/fps/scale yang dioptimalkan", async () => {
    const { compressVideoFile } = await loadModule();
    const file = videoFile(mp4("hvc1", 1_000_000)); // input jauh lebih besar dari output stub

    const result = await compressVideoFile(file);

    expect(result.compressed).toBe(true);
    expect(result.file.name).toBe("bukti.mp4");
    const argOf = (flag: string) => h.lastExec[h.lastExec.indexOf(flag) + 1];
    expect(argOf("-preset")).toBe("ultrafast");
    expect(argOf("-crf")).toBe("28");
    expect(argOf("-r")).toBe("30");
    expect(argOf("-threads")).toBe("0");
    expect(argOf("-vf")).toBe("scale=w=-2:h='min(720,ih)'");
    // MEMFS dibersihkan setelah selesai.
    expect(h.calls).toContain("delete:input.mp4");
    expect(h.calls).toContain("delete:output.mp4");
  });

  it("file ≥ 20 MB tetap di-encode walau sudah MP4/H.264", async () => {
    const { compressVideoFile } = await loadModule();
    const file = videoFile(mp4("avc1", 21 * 1024 * 1024));

    const result = await compressVideoFile(file);

    expect(result.compressed).toBe(true); // output stub 3 byte < input
    expect(h.calls).toContain("exec");
  });

  it("dua kompresi bersamaan dijalankan BERURUTAN (tidak saling menimpa MEMFS)", async () => {
    const { compressVideoFile } = await loadModule();
    h.execDelay = 20;

    await Promise.all([
      compressVideoFile(videoFile(mp4("hvc1", 1_000_000), "a.mp4")),
      compressVideoFile(videoFile(mp4("hvc1", 1_000_000), "b.mp4")),
    ]);

    // Tanpa antrean, urutannya akan write,write,on,on,exec,exec,…; dengan
    // antrean, `off` milik proses pertama muncul SEBELUM `write` kedua.
    const firstOff = h.calls.indexOf("off");
    const secondWrite = h.calls.indexOf("write:input.mp4", h.calls.indexOf("write:input.mp4") + 1);
    expect(firstOff).toBeGreaterThan(-1);
    expect(secondWrite).toBeGreaterThan(firstOff);
  });

  it("file non-video dilewatkan tanpa menyentuh ffmpeg", async () => {
    const { compressVideoFile } = await loadModule();
    const file = new File([new Uint8Array(32)], "catatan.txt", { type: "text/plain" });

    const result = await compressVideoFile(file);

    expect(result.compressed).toBe(false);
    expect(h.calls).toEqual([]);
  });
});
