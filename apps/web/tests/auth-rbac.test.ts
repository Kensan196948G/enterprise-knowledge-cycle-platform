import { describe, expect, it } from "vitest";
import { hasAtLeastRole } from "@/lib/rbac";

describe("hasAtLeastRole", () => {
  it("allows equal or higher roles", () => {
    expect(hasAtLeastRole("approver", "reviewer")).toBe(true);
    expect(hasAtLeastRole("reviewer", "reviewer")).toBe(true);
  });

  it("rejects lower roles", () => {
    expect(hasAtLeastRole("user", "reviewer")).toBe(false);
    expect(hasAtLeastRole(undefined, "user")).toBe(false);
  });
});
