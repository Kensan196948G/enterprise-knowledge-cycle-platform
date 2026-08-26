export type Role = "user" | "contributor" | "reviewer" | "approver" | "admin";

export type KnowledgeStatus =
  | "draft"
  | "ai_processed"
  | "review_pending"
  | "returned"
  | "approved"
  | "rejected"
  | "revalidation_required"
  | "archived";

export interface AuthUser {
  id: string;
  name: string;
  role: Role;
  department: string | null;
  email?: string;
}

export interface AiOutput {
  facts: string[];
  inferences: string[];
  unknowns: string[];
  evidenceRefs: string[];
  conflicts: string[];
  reviewQuestions: string[];
  aiConfidence: number;
  modelId: string;
}

export interface KnowledgeItem {
  id: string;
  title: string;
  version: number;
  status: KnowledgeStatus;
  projectSite: string | null;
  workCategory: string[];
  tags: string[];
  issue: string;
  cause: string | null;
  action: string | null;
  result: string | null;
  outcomeType: "success" | "failure" | "mixed" | "unknown";
  applicableConditions: string | null;
  exclusionConditions: string | null;
  standardsRefs: string[];
  aiConfidence: number | null;
  aiOutput: AiOutput | null;
  approverId: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeDetail extends KnowledgeItem {
  evidence: Array<{
    id: string;
    sourceId: string;
    sourceTitle: string;
    sourceUri: string | null;
    locationType: string;
    verified: boolean;
  }>;
  reviews: Array<{
    id: string;
    decision: "pending" | "approved" | "returned" | "rejected";
    comment: string | null;
    reason: string | null;
    escalated: boolean;
    createdAt: string;
    decidedAt: string | null;
  }>;
  usage: Array<{ eventType: string; count: number }>;
}

export interface SourceDocument {
  id: string;
  title: string;
  contentText: string;
  projectSite: string | null;
  workCategory: string[];
  createdAt: string;
}

export interface SearchResultItem {
  id: string;
  title: string;
  status: KnowledgeStatus;
  kind: "approved" | "reference";
  issue: string;
  cause: string | null;
  action: string | null;
  result: string | null;
  applicableConditions: string | null;
  exclusionConditions: string | null;
  standardsRefs: string[];
  version: number;
  approvedAt: string | null;
  evidence: Array<{ sourceTitle: string; sourceUri: string | null }>;
}

export interface Metrics {
  registration: { sourceCount: number; contributorCount: number };
  statusBreakdown: Array<{ status: string; count: number }>;
  review: { decidedCount: number; returnedCount: number; returnRate: number | null; avgReviewSeconds: number | null };
  approval: { approvedCount: number; rejectedCount: number; approvalRate: number | null; avgAiConfidence: number | null };
  usage: Array<{ eventType: string; count: number }>;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actorId: string | null;
  role: string | null;
  action: string;
  objectType: string;
  objectId: string | null;
  reason: string | null;
}
