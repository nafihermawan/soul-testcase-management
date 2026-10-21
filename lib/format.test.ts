import { describe, expect, it } from "vitest";
import {
  entityCode,
  firstUrlOf,
  getFormattedDate,
  monthLabel,
  parseMonthKey,
  platformPrefix,
  runCodeOf,
  sanitizeFilename,
} from "./format";

describe("platformPrefix", () => {
  it("memetakan enum platform ke prefix ID", () => {
    expect(platformPrefix("WEB")).toBe("web");
    expect(platformPrefix("mobile")).toBe("mob");
    expect(platformPrefix("HARDWARE")).toBe("hdw");
    expect(platformPrefix("API")).toBe("api");
  });

  it("fallback 'gen' saat platform kosong, lowercase saat tidak dikenal", () => {
    expect(platformPrefix(null)).toBe("gen");
    expect(platformPrefix("FOO")).toBe("foo");
  });
});

describe("entityCode", () => {
  it("format PREFIX-tahun-4karakter (huruf kecil)", () => {
    const year = new Date().getFullYear();
    expect(entityCode("BUG", "cmabcDEFgh3XYZ")).toBe(`bug-${year}-3xyz`);
  });
});

describe("sanitizeFilename", () => {
  it("membuang karakter khusus & mengubah spasi jadi hyphen", () => {
    expect(sanitizeFilename('Bug: Login / gagal!! "x"')).toBe("Bug-Login-gagal-x");
  });

  it("membatasi 40 karakter dan merapikan hyphen di ujung", () => {
    const out = sanitizeFilename("a".repeat(60));
    expect(out.length).toBe(40);
    expect(out.endsWith("-")).toBe(false);
  });

  it("string kosong / null jadi string kosong", () => {
    expect(sanitizeFilename(null)).toBe("");
    expect(sanitizeFilename("   ")).toBe("");
  });
});

describe("getFormattedDate", () => {
  it("YYYYMMDD dari tanggal UTC", () => {
    expect(getFormattedDate(new Date("2026-10-13T05:00:00Z"))).toBe("20261013");
  });
});

describe("runCodeOf", () => {
  it("format spNN-YYYYMMDD-xxxx (sprint + tanggal UTC + 4 karakter id)", () => {
    expect(
      runCodeOf({ id: "cmabcDEFgh87", sprint: "Sprint 3", createdAt: "2026-09-01T10:00:00Z" })
    ).toBe("sp03-20260901-gh87");
  });

  it("tanpa sprint memakai segmen 'spna'", () => {
    expect(runCodeOf({ id: "abc123XY", sprint: null, createdAt: "2026-01-05T00:00:00Z" })).toBe(
      "spna-20260105-23xy"
    );
  });
});

describe("parseMonthKey / monthLabel", () => {
  it("valid hanya YYYY-MM dengan bulan 1..12", () => {
    expect(parseMonthKey("2026-09")).toEqual({ year: 2026, month: 9 });
    expect(parseMonthKey("2026-13")).toBeNull();
    expect(parseMonthKey("2026-9")).toBeNull();
    expect(parseMonthKey(null)).toBeNull();
  });

  it("monthLabel memberi label singkat; kunci invalid dikembalikan apa adanya", () => {
    expect(monthLabel("2026-09")).toBe("Sep 2026");
    expect(monthLabel("bukan-bulan")).toBe("bukan-bulan");
  });
});

describe("firstUrlOf", () => {
  it("mengambil URL pertama dari teks multi-baris", () => {
    expect(firstUrlOf("catatan\nhttps://example.test/a?b=1\nhttps://kedua.test")).toBe(
      "https://example.test/a?b=1"
    );
  });

  it("null bila tidak ada URL", () => {
    expect(firstUrlOf("tanpa tautan")).toBeNull();
    expect(firstUrlOf(null)).toBeNull();
  });
});
