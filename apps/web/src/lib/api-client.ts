const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8210";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("ekcp_token");
}

export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem("ekcp_token", token);
  else window.localStorage.removeItem("ekcp_token");
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, body.error ?? `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  login: (email: string, password: string) =>
    request<{ token: string; user: import("./types").AuthUser }>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<import("./types").AuthUser>("/api/v1/auth/me"),

  listSources: () => request<{ items: import("./types").SourceDocument[] }>("/api/v1/sources"),
  createSource: (input: { title: string; contentText: string; projectSite?: string; workCategory?: string[] }) =>
    request<import("./types").SourceDocument>("/api/v1/sources", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  createCandidate: (sourceIds: string[], title?: string) =>
    request<import("./types").KnowledgeItem>("/api/v1/knowledge/candidates", {
      method: "POST",
      body: JSON.stringify({ sourceIds, title }),
    }),
  listKnowledge: (params?: { status?: string; q?: string; workCategory?: string }) => {
    const usp = new URLSearchParams();
    if (params?.status) usp.set("status", params.status);
    if (params?.q) usp.set("q", params.q);
    if (params?.workCategory) usp.set("workCategory", params.workCategory);
    const qs = usp.toString();
    return request<{ items: import("./types").KnowledgeItem[] }>(`/api/v1/knowledge${qs ? `?${qs}` : ""}`);
  },
  getKnowledge: (id: string) => request<import("./types").KnowledgeDetail>(`/api/v1/knowledge/${id}`),
  getSimilar: (id: string) => request<{ items: import("./types").KnowledgeItem[] }>(`/api/v1/knowledge/${id}/similar`),
  updateKnowledge: (id: string, patch: Record<string, unknown>) =>
    request<import("./types").KnowledgeItem>(`/api/v1/knowledge/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  archive: (id: string, reason: string) =>
    request<import("./types").KnowledgeItem>(`/api/v1/knowledge/${id}/archive`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
  revalidate: (id: string, reason?: string) =>
    request<import("./types").KnowledgeItem>(`/api/v1/knowledge/${id}/revalidate`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),

  requestReview: (knowledgeId: string, comment?: string) =>
    request<{ id: string }>("/api/v1/reviews", {
      method: "POST",
      body: JSON.stringify({ knowledgeId, comment }),
    }),
  approve: (reviewId: string, acknowledgeConflicts = false) =>
    request<import("./types").KnowledgeItem>(`/api/v1/reviews/${reviewId}/approve`, {
      method: "POST",
      body: JSON.stringify({ acknowledgeConflicts }),
    }),
  returnReview: (reviewId: string, reason: string) =>
    request<import("./types").KnowledgeItem>(`/api/v1/reviews/${reviewId}/return`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
  rejectReview: (reviewId: string, reason: string) =>
    request<import("./types").KnowledgeItem>(`/api/v1/reviews/${reviewId}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),

  search: (query: string, workCategory?: string) =>
    request<{ approved: import("./types").SearchResultItem[]; reference: import("./types").SearchResultItem[] }>(
      "/api/v1/search",
      { method: "POST", body: JSON.stringify({ query, workCategory }) },
    ),

  metrics: () => request<import("./types").Metrics>("/api/v1/metrics"),
  audit: () => request<{ items: import("./types").AuditLogEntry[] }>("/api/v1/audit"),
};
