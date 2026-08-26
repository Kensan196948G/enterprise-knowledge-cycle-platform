import type { KnowledgeItem } from "./types";

/**
 * レビュー待ち知見の優先度スコア(0〜1)。滞留日数だけでなく、AIが検出した
 * 矛盾の件数・AI信頼度の低さも加味し、「早く着手すべき順」を判断しやすくする。
 * 外部AI呼び出しは行わず、既に取得済みのデータから計算する軽量な指標。
 */
export function priorityScore(item: KnowledgeItem, daysAgo: number): number {
  const daysScore = Math.min(daysAgo / 14, 1);
  const conflictsScore = Math.min((item.aiOutput?.conflicts.length ?? 0) / 2, 1);
  const confidenceScore = 1 - (item.aiConfidence ?? 0.5);
  return daysScore * 0.5 + conflictsScore * 0.3 + confidenceScore * 0.2;
}

export function priorityReasons(item: KnowledgeItem, daysAgo: number): string[] {
  const reasons: string[] = [];
  if (daysAgo >= 3) reasons.push(`${daysAgo}日経過`);
  const conflicts = item.aiOutput?.conflicts.length ?? 0;
  if (conflicts > 0) reasons.push(`矛盾${conflicts}件`);
  if (item.aiConfidence !== null && item.aiConfidence < 0.75) reasons.push("AI信頼度が低め");
  return reasons;
}
