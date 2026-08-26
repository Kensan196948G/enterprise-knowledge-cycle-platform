import { db } from "../db/client.js";
import { auditLogs } from "../db/schema.js";
import type { Role } from "./rbac.js";

/** db または db.transaction() のコールバック引数(tx) のどちらも受け付ける */
type Executor = Pick<typeof db, "insert">;

export interface AuditEntryInput {
  actorId: string | null;
  role: Role | null;
  action:
    | "LOGIN"
    | "VIEW"
    | "CREATE"
    | "UPDATE"
    | "AI_RUN"
    | "REVIEW"
    | "RETURN"
    | "APPROVE"
    | "REJECT"
    | "ARCHIVE"
    | "REVALIDATE"
    | "DELETE"
    | "PERMISSION_CHANGE"
    | "CONFIG_CHANGE";
  objectType: string;
  objectId?: string;
  beforeVersion?: number;
  afterVersion?: number;
  reason?: string;
  correlationId?: string;
  sourceIp?: string;
}

/**
 * 詳細仕様設計書 §14: 誰が・いつ・何を・どの根拠で変更したかを追記記録する。
 * executor に db.transaction() の tx を渡すと、業務更新と監査記録を
 * 同一トランザクションで確定できる(既定は db を直接使用)。
 */
export async function recordAudit(entry: AuditEntryInput, executor: Executor = db): Promise<void> {
  await executor.insert(auditLogs).values({
    actorId: entry.actorId,
    role: entry.role,
    action: entry.action,
    objectType: entry.objectType,
    objectId: entry.objectId,
    beforeVersion: entry.beforeVersion,
    afterVersion: entry.afterVersion,
    reason: entry.reason,
    correlationId: entry.correlationId,
    sourceIp: entry.sourceIp,
  });
}

export function newCorrelationId(): string {
  return crypto.randomUUID();
}
