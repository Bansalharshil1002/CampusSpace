import { afterEach, describe, expect, it } from "vitest";
import {
  DEMO_ACCOUNTS,
  clearDemoSession,
  demoCanUpdate,
  findDemoAccount,
  loadDemoAccount,
  loadDemoOverrides,
  saveDemoOverride,
  startDemoSession,
} from "@/lib/demo";

afterEach(() => {
  clearDemoSession();
});

describe("demo accounts", () => {
  it("covers the requested dashboards with two CRs and two teachers", () => {
    expect(DEMO_ACCOUNTS.map((account) => account.role)).toEqual([
      "student",
      "cr",
      "cr",
      "teacher",
      "teacher",
      "admin",
    ]);
    expect(new Set(DEMO_ACCOUNTS.map((account) => account.id)).size).toBe(DEMO_ACCOUNTS.length);
    expect(DEMO_ACCOUNTS.map((account) => account.email)).toEqual(
      expect.arrayContaining(["cr2@thapar.edu", "teacher2@thapar.edu"]),
    );
  });

  it("signs in with the hardcoded email and password only", () => {
    expect(findDemoAccount("CR@thapar.edu", "cr123")?.role).toBe("cr");
    expect(findDemoAccount("cr2@thapar.edu", "cr123")?.name).toBe("Rohan CR");
    expect(findDemoAccount("student@thapar.edu", "student123")?.role).toBe("student");
    expect(findDemoAccount("teacher@thapar.edu", "teacher123")?.role).toBe("teacher");
    expect(findDemoAccount("teacher2@thapar.edu", "teacher123")?.role).toBe("teacher");
    expect(findDemoAccount("doaa@thapar.edu", "doaa123")?.role).toBe("admin");
    expect(findDemoAccount("cr@thapar.edu", "wrong")).toBeNull();
    expect(findDemoAccount("someone@thapar.edu", "cr123")).toBeNull();
  });

  it("limits CR and teacher updates to their demo rooms", () => {
    const cr = DEMO_ACCOUNTS.find((account) => account.role === "cr") ?? null;
    const teacher = DEMO_ACCOUNTS.find((account) => account.role === "teacher") ?? null;
    const admin = DEMO_ACCOUNTS.find((account) => account.role === "admin") ?? null;
    const student = DEMO_ACCOUNTS.find((account) => account.role === "student") ?? null;

    expect(demoCanUpdate(cr, "CSED-204")).toBe(true);
    expect(demoCanUpdate(cr, "CSED-202")).toBe(true);
    expect(demoCanUpdate(cr, "LT-301")).toBe(false);
    expect(demoCanUpdate(teacher, "LT-301")).toBe(true);
    expect(demoCanUpdate(teacher, "CSED-204")).toBe(true);
    expect(demoCanUpdate(teacher, "CSED-202")).toBe(false);
    expect(demoCanUpdate(admin, "CSED-103")).toBe(true);
    expect(demoCanUpdate(student, "CSED-204")).toBe(false);
    expect(demoCanUpdate(null, "CSED-204")).toBe(false);
  });

  it("saves the demo session on this device", () => {
    const teacher = DEMO_ACCOUNTS.find((account) => account.role === "teacher");
    expect(teacher).toBeDefined();
    startDemoSession(teacher!);
    expect(loadDemoAccount()?.email).toBe("teacher@thapar.edu");
    clearDemoSession();
    expect(loadDemoAccount()).toBeNull();
  });

  it("keeps demo room updates in the browser", () => {
    saveDemoOverride("CSED-204", {
      status: "OCCUPIED",
      note: "Demo update",
      updatedAt: new Date().toISOString(),
      by: "Simran CR",
    });
    expect(loadDemoOverrides()["CSED-204"]?.status).toBe("OCCUPIED");
  });
});
