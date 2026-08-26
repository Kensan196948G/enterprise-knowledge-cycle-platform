import { afterEach, describe, expect, it } from "vitest";
import { isAuthOpen } from "../src/lib/auth.js";

describe("isAuthOpen", () => {
  afterEach(() => {
    delete process.env.AUTH_MODE;
  });

  it("defaults to fail-closed (secure) when AUTH_MODE is unset", () => {
    delete process.env.AUTH_MODE;
    expect(isAuthOpen()).toBe(false);
  });

  it("only opens when AUTH_MODE is exactly 'open'", () => {
    process.env.AUTH_MODE = "open";
    expect(isAuthOpen()).toBe(true);
    process.env.AUTH_MODE = "true";
    expect(isAuthOpen()).toBe(false);
  });
});
