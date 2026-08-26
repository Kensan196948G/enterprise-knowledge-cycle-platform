import { describe, expect, it } from "vitest";
import { rankBySimilarity, rankSimilarDocs } from "../src/lib/text-similarity.js";

describe("rankBySimilarity", () => {
  const docs = [
    { id: "a", text: "コンクリート打設後のひび割れ対策について" },
    { id: "b", text: "橋梁の仮設支保工計画の見直し" },
    { id: "c", text: "盛土施工における締固め不足の是正" },
  ];

  it("ranks documents sharing terms with the query higher", () => {
    const results = rankBySimilarity("コンクリートのひび割れ", docs);
    expect(results[0]?.id).toBe("a");
  });

  it("excludes documents below the minimum score", () => {
    const results = rankBySimilarity("コンクリートのひび割れ", docs, { minScore: 0.9 });
    expect(results.length).toBe(0);
  });

  it("returns empty array for an empty corpus", () => {
    expect(rankBySimilarity("query", [])).toEqual([]);
  });
});

describe("rankSimilarDocs", () => {
  it("excludes the target document itself", () => {
    const target = { id: "a", text: "コンクリート打設後のひび割れ対策" };
    const others = [
      target,
      { id: "b", text: "コンクリート打設のひび割れ防止策" },
      { id: "c", text: "橋梁の仮設支保工計画" },
    ];
    const results = rankSimilarDocs(target, others);
    expect(results.some((r) => r.id === "a")).toBe(false);
    expect(results[0]?.id).toBe("b");
  });
});
