import { describe, expect, it } from "vitest";
import { statusesFor } from "@/lib/status";

describe("status vocabulary per room type", () => {
  it("activity spaces only allow FREE and OCCUPIED", () => {
    expect(statusesFor("activity_space")).toEqual(["FREE", "OCCUPIED"]);
  });
  it("classrooms never offer OCCUPIED", () => {
    expect(statusesFor("classroom")).not.toContain("OCCUPIED");
    expect(statusesFor("classroom")).toContain("NOT_ARRIVED");
  });
});
