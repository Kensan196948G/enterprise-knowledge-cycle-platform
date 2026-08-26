import { describe, expect, it } from "vitest";
import { structureWithRules } from "../src/lib/ai-structuring.js";

describe("structureWithRules", () => {
  it("separates facts / inferences / unknowns and never fabricates missing values", () => {
    const text = "課題: 打設後にひび割れが発生した。結果: 対策後は発生していない。";
    const out = structureWithRules(text, ["src-1"]);

    expect(out.fields.issue).toContain("ひび割れ");
    // 原因(cause)の記述が原文に存在しないため、無断で値を補完してはならない
    expect(out.fields.cause).toBeNull();
    expect(out.unknowns.some((u) => u.includes("原因"))).toBe(true);
    expect(out.evidenceRefs).toEqual(["source:src-1"]);
  });

  it("flags conflicts when success and failure keywords coexist", () => {
    const text = "課題: 品質不具合が発生した。結果: 改善した効果があった。しかし別区間では再発した手戻りが生じた。";
    const out = structureWithRules(text, ["src-2"]);
    expect(out.fields.outcomeType).toBe("mixed");
    expect(out.conflicts.length).toBeGreaterThan(0);
  });

  it("detects work category keywords", () => {
    const text = "課題: 単管足場の壁つなぎ間隔が不足していた。安全パトロールで是正した。";
    const out = structureWithRules(text, ["src-3"]);
    expect(out.fields.workCategory).toContain("安全管理");
  });
});
