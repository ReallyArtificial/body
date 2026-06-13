/**
 * Workflow execution types
 */

export type WorkflowStatus =
  | 'pending'
  | 'running'
  | 'success'
  | 'failed'
  | 'rolled_back'
  | 'rejected';

export type ActionStatus = 'pending' | 'running' | 'success' | 'failed' | 'rolled_back';

export interface Workflow {
  id: string;
  name: string;
  status: WorkflowStatus;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

export interface WorkflowAction {
  id: string;
  workflowId: string;
  name: string;
  inputs: unknown;
  outputs?: unknown;
  status: ActionStatus;
  retryCount: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: Date;
  workflowId: string;
  actionName: string;
  inputs: unknown;
  outputs?: unknown;
  status: 'success' | 'failed' | 'rolled_back';
  triggeredBy?: string;
  approvedBy?: string;
  error?: string;
  signature: string;
}

export interface WorkflowConfig {
  maxRetries?: number;
  retryDelayMs?: number;
  requiresApproval?: boolean;
}
