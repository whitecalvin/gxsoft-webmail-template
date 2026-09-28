import "server-only";

import { MailServiceError } from "./mail";
import { serviceStatus, tastemailRequest } from "./server";

const STATES = new Set(["pending", "approved", "rejected", "cancelled"]);
const STEP_STATES = new Set(["pending", "approved", "rejected", "skipped"]);

export type LiveApprovalState = "pending" | "approved" | "rejected" | "cancelled";
export type LiveApprovalStepState = "pending" | "approved" | "rejected" | "skipped";

export type LiveApprovalStep = {
  id: string;
  position: number;
  approverUsername: string;
  state: LiveApprovalStepState;
  comment: string;
  actedAt: string | null;
};

export type LiveApproval = {
  id: string;
  requesterUsername: string;
  title: string;
  description: string;
  state: LiveApprovalState;
  currentStep: number | null;
  isMyTurn: boolean;
  steps: LiveApprovalStep[];
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export class ApprovalServiceError extends Error {
  constructor(readonly status: "invalid_request" | "not_found" | MailServiceError["status"]) {
    super(status);
  }
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function nullableDate(value: unknown): value is string | null {
  return value === null || typeof value === "string" && Number.isFinite(Date.parse(value));
}

function stepFrom(value: unknown): LiveApprovalStep {
  const step = object(value);
  if (!step || typeof step.id !== "string" || !step.id ||
    typeof step.position !== "number" || !Number.isSafeInteger(step.position) || step.position < 0 ||
    typeof step.approverUsername !== "string" || !step.approverUsername ||
    typeof step.state !== "string" || !STEP_STATES.has(step.state) ||
    typeof step.comment !== "string" || !nullableDate(step.actedAt)) {
    throw new MailServiceError("unavailable");
  }
  return {
    id: step.id, position: step.position, approverUsername: step.approverUsername,
    state: step.state as LiveApprovalStepState, comment: step.comment, actedAt: step.actedAt,
  };
}

function approvalFrom(value: unknown): LiveApproval {
    const item = object(value);
    if (!item || typeof item.id !== "string" || !item.id ||
      typeof item.requesterUsername !== "string" || !item.requesterUsername ||
      typeof item.title !== "string" || !item.title || typeof item.description !== "string" ||
      typeof item.state !== "string" || !STATES.has(item.state) ||
      !(item.currentStep === null || typeof item.currentStep === "number" && Number.isSafeInteger(item.currentStep) && item.currentStep >= 0) ||
      typeof item.isMyTurn !== "boolean" || !Array.isArray(item.steps) || item.steps.length > 20 ||
      !nullableDate(item.decidedAt) || !nullableDate(item.createdAt) || item.createdAt === null ||
      !nullableDate(item.updatedAt) || item.updatedAt === null) {
      throw new MailServiceError("unavailable");
    }
    return {
      id: item.id,
      requesterUsername: item.requesterUsername,
      title: item.title,
      description: item.description,
      state: item.state as LiveApprovalState,
      currentStep: item.currentStep,
      isMyTurn: item.isMyTurn,
      steps: item.steps.map(stepFrom),
      decidedAt: item.decidedAt,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    } as LiveApproval;
}

export async function loadLiveApprovals(token: string): Promise<LiveApproval[]> {
  const response = await tastemailRequest("/api/approvals", token);
  if (!response.ok) throw new MailServiceError(serviceStatus(response.status));
  const payload = object(await response.json());
  if (!Array.isArray(payload?.items) || payload.items.length > 500) throw new MailServiceError("unavailable");
  return payload.items.map(approvalFrom);
}

export async function createLiveApproval(token: string, title: string, description: string, approverUsernames: string[]): Promise<LiveApproval> {
  const response = await tastemailRequest("/api/approvals", token, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title, description, approverUsernames }),
  });
  if (!response.ok) throw new ApprovalServiceError(response.status === 400 ? "invalid_request" : serviceStatus(response.status));
  const payload = object(await response.json());
  return approvalFrom(payload?.approval);
}

export async function decideLiveApproval(token: string, id: string, action: "approve" | "reject", comment: string): Promise<LiveApproval> {
  const response = await tastemailRequest(`/api/approvals/${encodeURIComponent(id)}`, token, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, comment: comment.trim() || null }),
  });
  if (!response.ok) throw new ApprovalServiceError(response.status === 400 ? "invalid_request" : response.status === 404 ? "not_found" : serviceStatus(response.status));
  const payload = object(await response.json());
  return approvalFrom(payload?.approval);
}
