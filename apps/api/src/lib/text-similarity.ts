import type { knowledgeItems } from "../db/schema.js";

/**
 * 依存ライブラリ・外部埋め込みAPIなしで動く軽量な「意味的検索(簡易版)」エンジン。
 * 文字bigram化 + TF-IDF + コサイン類似度という古典的な情報検索手法を用いており、
 * 日本語の分かち書き(形態素解析)なしでも部分一致・表記ゆれにある程度強い
 * ランキングができる。ANTHROPIC_API_KEY等の外部キーに依存しないため、この
 * MVP環境でも常に動作する。将来、埋め込みAPI(例: Voyage AI)が利用可能になれば
 * ここを真のベクトル埋め込みに置き換えられるよう、入出力を単純な形に保っている。
 */

function toBigrams(text: string): string[] {
  const normalized = text.replace(/\s+/g, "").toLowerCase();
  if (normalized.length === 0) return [];
  if (normalized.length === 1) return [normalized];
  const grams: string[] = [];
  for (let i = 0; i < normalized.length - 1; i++) {
    grams.push(normalized.slice(i, i + 2));
  }
  return grams;
}

function termFrequency(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
  return tf;
}

function buildIdf(docsTokens: string[][]): Map<string, number> {
  const df = new Map<string, number>();
  for (const tokens of docsTokens) {
    for (const t of new Set(tokens)) df.set(t, (df.get(t) ?? 0) + 1);
  }
  const n = docsTokens.length;
  const idf = new Map<string, number>();
  for (const [term, count] of df) idf.set(term, Math.log((n + 1) / (count + 1)) + 1);
  return idf;
}

function tfidfVector(tf: Map<string, number>, idf: Map<string, number>): Map<string, number> {
  const vec = new Map<string, number>();
  for (const [term, freq] of tf) vec.set(term, freq * (idf.get(term) ?? 0));
  return vec;
}

function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const v of a.values()) normA += v * v;
  for (const v of b.values()) normB += v * v;
  for (const [term, va] of a) {
    const vb = b.get(term);
    if (vb) dot += va * vb;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export interface SimilarityDoc {
  id: string;
  text: string;
}

export interface SimilarityResult {
  id: string;
  score: number;
}

/** クエリ文字列と文書集合をTF-IDFコサイン類似度でランク付けする。 */
export function rankBySimilarity(query: string, docs: SimilarityDoc[], opts?: { minScore?: number; limit?: number }): SimilarityResult[] {
  if (docs.length === 0) return [];
  const minScore = opts?.minScore ?? 0.05;
  const queryTokens = toBigrams(query);
  const docTokensList = docs.map((d) => toBigrams(d.text));
  const idf = buildIdf([queryTokens, ...docTokensList]);
  const queryVec = tfidfVector(termFrequency(queryTokens), idf);

  const results = docs
    .map((d, i) => ({ id: d.id, score: cosineSimilarity(queryVec, tfidfVector(termFrequency(docTokensList[i]), idf)) }))
    .filter((r) => r.score >= minScore)
    .sort((a, b) => b.score - a.score);

  return opts?.limit ? results.slice(0, opts.limit) : results;
}

/** 文書集合どうしの相互類似度を計算する(類似知見判定用)。対象を除外して降順に返す。 */
export function rankSimilarDocs(target: SimilarityDoc, others: SimilarityDoc[], opts?: { minScore?: number; limit?: number }): SimilarityResult[] {
  return rankBySimilarity(target.text, others.filter((d) => d.id !== target.id), opts);
}

type KnowledgeRow = typeof knowledgeItems.$inferSelect;

/** knowledge_items の各構造化フィールドを類似度計算用の1本のテキストに結合する。 */
export function knowledgeSearchableText(row: KnowledgeRow): string {
  return [row.title, row.issue, row.cause, row.action, row.result, row.applicableConditions, ...row.workCategory, ...row.tags]
    .filter((v): v is string => !!v)
    .join(" ");
}
