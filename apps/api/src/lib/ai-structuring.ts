import crypto from "node:crypto";

/**
 * 詳細仕様設計書 §7 AI処理パイプライン の必須出力フォーマット。
 * facts/inferences/unknowns を明確に分離し、根拠のない値を事実として
 * 自動補完しないことを最優先制約とする。
 */
export interface StructuredOutput {
  facts: string[];
  inferences: string[];
  unknowns: string[];
  evidenceRefs: string[];
  conflicts: string[];
  reviewQuestions: string[];
  fields: {
    issue: string;
    cause: string | null;
    action: string | null;
    result: string | null;
    outcomeType: "success" | "failure" | "mixed" | "unknown";
    workCategory: string[];
    tags: string[];
    applicableConditions: string | null;
    exclusionConditions: string | null;
    standardsRefs: string[];
  };
  aiConfidence: number;
  modelId: string;
  modelVersion: string;
  promptVersion: string;
  latencyMs: number;
}

const PROMPT_VERSION = "ekcp-structuring-v1";

const WORK_CATEGORY_DICTIONARY: Record<string, string[]> = {
  土木: ["土木", "掘削", "盛土", "護岸", "港湾", "橋梁", "トンネル"],
  建築: ["建築", "躯体", "内装", "外装", "鉄骨"],
  設備: ["設備", "配管", "空調", "電気設備", "給排水"],
  安全管理: ["安全", "災害", "ヒヤリハット", "労災", "墜落"],
  品質管理: ["品質", "不具合", "検査", "是正", "手直し"],
  仮設計画: ["仮設", "足場", "型枠", "支保工"],
  コンクリート工事: ["コンクリート", "打設", "養生", "配合"],
};

const OUTCOME_KEYWORDS: Record<"success" | "failure", string[]> = {
  success: ["成功", "改善した", "効果があった", "解消した", "削減できた"],
  failure: ["失敗", "再発した", "不具合が発生", "手戻り", "遅延した"],
};

const SECTION_MARKERS: Record<string, string[]> = {
  issue: ["課題", "問題", "事象", "トラブル"],
  cause: ["原因", "要因", "背景"],
  action: ["対応", "対策", "実施した", "施工方法"],
  result: ["結果", "効果", "成果"],
  applicable: ["適用条件", "適用範囲", "前提条件"],
  exclusion: ["注意", "適用不可", "適用できない", "例外"],
};

function splitSentences(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .split(/(?<=[。\n])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function extractSection(sentences: string[], markers: string[]): string[] {
  return sentences.filter((s) => markers.some((m) => s.includes(m)));
}

const LABEL_PREFIX_PATTERN =
  /^(課題|問題|事象|トラブル|原因|要因|背景|対応|対策|実施した対応|施工方法|結果|効果|成果|適用条件|適用範囲|前提条件|注意|適用不可条件|適用できない|例外)[:：]\s*/;

/** 抽出した文頭のラベル(「課題: 」等)を除去し、UI表示時の二重表記を防ぐ */
function stripLabel(sentence: string): string {
  return sentence.replace(LABEL_PREFIX_PATTERN, "").trim();
}

function hash(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex").slice(0, 32);
}

/**
 * ルールベース構造化エンジン(既定)。ANTHROPIC_API_KEY が設定されている場合は
 * runAiStructuring() が実LLM経路を優先するが、こちらは秘密情報なしで
 * 常に動作することを保証する MVP の中核ロジック。
 */
export function structureWithRules(sourceText: string, sourceIds: string[]): StructuredOutput {
  const start = Date.now();
  const sentences = splitSentences(sourceText);

  const issueSentences = extractSection(sentences, SECTION_MARKERS.issue).map(stripLabel);
  const causeSentences = extractSection(sentences, SECTION_MARKERS.cause).map(stripLabel);
  const actionSentences = extractSection(sentences, SECTION_MARKERS.action).map(stripLabel);
  const resultSentences = extractSection(sentences, SECTION_MARKERS.result).map(stripLabel);
  const applicableSentences = extractSection(sentences, SECTION_MARKERS.applicable).map(stripLabel);
  const exclusionSentences = extractSection(sentences, SECTION_MARKERS.exclusion).map(stripLabel);

  const facts = [...issueSentences, ...resultSentences];
  const inferences = [...causeSentences, ...actionSentences].map(
    (s) => `(推論候補) ${s}`,
  );

  const unknowns: string[] = [];
  if (causeSentences.length === 0) unknowns.push("原因に関する記述が原文から検出できません。");
  if (resultSentences.length === 0) unknowns.push("結果・効果に関する記述が原文から検出できません。");
  if (applicableSentences.length === 0) unknowns.push("適用条件が原文に明示されていません。");

  const workCategory = Object.entries(WORK_CATEGORY_DICTIONARY)
    .filter(([, keywords]) => keywords.some((k) => sourceText.includes(k)))
    .map(([category]) => category);

  let outcomeType: StructuredOutput["fields"]["outcomeType"] = "unknown";
  const successHit = OUTCOME_KEYWORDS.success.some((k) => sourceText.includes(k));
  const failureHit = OUTCOME_KEYWORDS.failure.some((k) => sourceText.includes(k));
  if (successHit && failureHit) outcomeType = "mixed";
  else if (successHit) outcomeType = "success";
  else if (failureHit) outcomeType = "failure";

  const conflicts: string[] = [];
  if (successHit && failureHit) {
    conflicts.push("成功を示す表現と失敗を示す表現が同一原文に混在しています。人による確認が必要です。");
  }

  const evidenceRefs = sourceIds.map((id) => `source:${id}`);

  const hitCount = [issueSentences, causeSentences, actionSentences, resultSentences].filter(
    (arr) => arr.length > 0,
  ).length;
  const aiConfidence = Math.min(0.95, 0.35 + hitCount * 0.15);

  const reviewQuestions = [
    "適用条件・適用不可条件は現場の実情と一致していますか。",
    "抽出された原因・対策は一次情報の内容と矛盾していませんか。",
  ];
  if (unknowns.length > 0) {
    reviewQuestions.push("unknowns に記載された不明点を、レビュー時に確認してください。");
  }

  const result: StructuredOutput = {
    facts: facts.length > 0 ? facts : [sentences[0] ?? sourceText.slice(0, 80)],
    inferences,
    unknowns,
    evidenceRefs,
    conflicts,
    reviewQuestions,
    fields: {
      issue: (issueSentences[0] ?? sentences[0] ?? sourceText.slice(0, 120)).trim(),
      cause: causeSentences[0]?.trim() ?? null,
      action: actionSentences[0]?.trim() ?? null,
      result: resultSentences[0]?.trim() ?? null,
      outcomeType,
      workCategory,
      tags: workCategory,
      applicableConditions: applicableSentences.join(" ") || null,
      exclusionConditions: exclusionSentences.join(" ") || null,
      standardsRefs: [],
    },
    aiConfidence,
    modelId: "rule-based-extractor",
    modelVersion: "1.0.0",
    promptVersion: PROMPT_VERSION,
    latencyMs: Date.now() - start,
  };
  return result;
}

async function structureWithAnthropic(
  sourceText: string,
  sourceIds: string[],
  apiKey: string,
): Promise<StructuredOutput> {
  const start = Date.now();
  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5";
  const systemPrompt = `あなたは建設・土木業向け社内ナレッジ循環基盤のAI構造化エンジンです。
与えられた原文から、facts(原文に明示された事実)・inferences(推論。事実と分離)・unknowns(不明・要確認)・
conflicts(矛盾)・review_questions(人に確認すべき事項)を抽出し、根拠のない値や条件を事実として補完しないでください。
出力は必ず次のJSON schemaのみで返してください（説明文は不要）:
{"facts":string[],"inferences":string[],"unknowns":string[],"conflicts":string[],"review_questions":string[],
"fields":{"issue":string,"cause":string|null,"action":string|null,"result":string|null,
"outcome_type":"success"|"failure"|"mixed"|"unknown","work_category":string[],"tags":string[],
"applicable_conditions":string|null,"exclusion_conditions":string|null,"standards_refs":string[]},
"ai_confidence":number}`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{ role: "user", content: sourceText }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic API error: ${response.status}`);
  }
  const data = (await response.json()) as {
    content: Array<{ type: string; text?: string }>;
  };
  const text = data.content.find((c) => c.type === "text")?.text ?? "{}";
  const parsed = JSON.parse(text) as {
    facts: string[];
    inferences: string[];
    unknowns: string[];
    conflicts: string[];
    review_questions: string[];
    fields: {
      issue: string;
      cause: string | null;
      action: string | null;
      result: string | null;
      outcome_type: "success" | "failure" | "mixed" | "unknown";
      work_category: string[];
      tags: string[];
      applicable_conditions: string | null;
      exclusion_conditions: string | null;
      standards_refs: string[];
    };
    ai_confidence: number;
  };

  return {
    facts: parsed.facts ?? [],
    inferences: parsed.inferences ?? [],
    unknowns: parsed.unknowns ?? [],
    evidenceRefs: sourceIds.map((id) => `source:${id}`),
    conflicts: parsed.conflicts ?? [],
    reviewQuestions: parsed.review_questions ?? [],
    fields: {
      issue: parsed.fields.issue,
      cause: parsed.fields.cause,
      action: parsed.fields.action,
      result: parsed.fields.result,
      outcomeType: parsed.fields.outcome_type ?? "unknown",
      workCategory: parsed.fields.work_category ?? [],
      tags: parsed.fields.tags ?? [],
      applicableConditions: parsed.fields.applicable_conditions,
      exclusionConditions: parsed.fields.exclusion_conditions,
      standardsRefs: parsed.fields.standards_refs ?? [],
    },
    aiConfidence: parsed.ai_confidence ?? 0.5,
    modelId: model,
    modelVersion: "anthropic-messages-2023-06-01",
    promptVersion: PROMPT_VERSION,
    latencyMs: Date.now() - start,
  };
}

/**
 * AI構造化のエントリポイント。ANTHROPIC_API_KEY が設定されていれば実LLM呼び出しを
 * 行い、失敗時・未設定時はルールベースへフォールバックする（MVPが秘密情報なしで
 * 常に動作することを保証する）。
 */
export async function runAiStructuring(
  sourceText: string,
  sourceIds: string[],
): Promise<StructuredOutput> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) {
    try {
      return await structureWithAnthropic(sourceText, sourceIds, apiKey);
    } catch {
      // フォールバック: ルールベースエンジンで継続する
      return structureWithRules(sourceText, sourceIds);
    }
  }
  return structureWithRules(sourceText, sourceIds);
}

export function contentHash(text: string): string {
  return hash(text);
}
