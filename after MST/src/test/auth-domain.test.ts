import { describe, expect, it } from "vitest";
import { emailError } from "@/lib/auth-domain";

describe("college email restriction", () => {
  it("allows @thapar.edu addresses", () => {
    expect(emailError("sarah@thapar.edu")).toBeNull();
    expect(emailError("  Sarah@THAPAR.EDU ")).toBeNull();
  });
  it("rejects other domains with a clear message", () => {
    expect(emailError("sarah@gmail.com")).toBe(
      "Only @thapar.edu college email addresses can sign in.",
    );
    expect(emailError("sarah@thapar.edu.evil.com")).toBe(
      "Only @thapar.edu college email addresses can sign in.",
    );
  });
  it("rejects malformed addresses", () => {
    expect(emailError("not-an-email")).toBe("Enter a valid email address.");
  });
});
