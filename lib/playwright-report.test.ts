import { describe, expect, it } from "vitest";
import { parsePlaywrightReport } from "./playwright-report";

const sample = {
  suites: [
    {
      title: "Login Functionality Tests",
      file: "tests/login.spec.ts",
      specs: [
        {
          title: "[LG-001] should login successfully with valid credentials",
          ok: true,
          file: "tests/login.spec.ts",
          tests: [{ results: [{ status: "passed" }] }],
        },
        {
          title: "[LG-002] should show error for invalid email",
          ok: false,
          file: "tests/login.spec.ts",
          tests: [{ results: [{ status: "failed" }] }],
        },
        {
          title: "afterEach cleanup",
          ok: true,
          tests: [{ results: [{ status: "passed" }] }],
        },
      ],
      suites: [
        {
          title: "Role-Based Login Tests",
          file: "tests/login.spec.ts",
          specs: [
            {
              title: "[LG-009] should login successfully as Superadmin",
              ok: true,
              file: "tests/login.spec.ts",
              tests: [{ results: [{ status: "passed" }] }],
            },
            {
              title: "[LG-099] skipped case",
              ok: true,
              file: "tests/login.spec.ts",
              tests: [{ results: [{ status: "skipped" }] }],
            },
          ],
        },
      ],
    },
  ],
};

describe("parsePlaywrightReport", () => {
  it("membaca spec bersarang dan memetakan status", () => {
    const { entries, withoutId, errors } = parsePlaywrightReport(sample);
    expect(errors).toEqual([]);
    expect(withoutId).toBe(1);

    const byId = new Map(entries.map((e) => [e.externalTestId, e]));
    expect(entries).toHaveLength(4);
    expect(byId.get("LG-001")?.status).toBe("PASS");
    expect(byId.get("LG-002")?.status).toBe("FAIL");
    expect(byId.get("LG-009")?.status).toBe("PASS");
    expect(byId.get("LG-099")?.status).toBe("SKIPPED");
    expect(byId.get("LG-001")?.scriptPath).toBe("tests/login.spec.ts");
  });

  it("menolak input yang bukan laporan Playwright", () => {
    expect(parsePlaywrightReport({ foo: 1 }).errors.length).toBeGreaterThan(0);
    expect(parsePlaywrightReport(null).errors.length).toBeGreaterThan(0);
  });
});
