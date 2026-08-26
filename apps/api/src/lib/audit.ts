import { db } from "../db/client.js";
import { auditLogs } from "../db/schema.js";
import type { Role } from "./rbac.js";

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

/** 詳細仕様設計書 §14: 誰が・いつ・何を・どの根拠で変更したかを追記記録する */
export async function recordAudit(entry: AuditEntryInput): Promise<void> {
  await db.insert(auditLogs).values({
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
