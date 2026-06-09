import { z, ZodSchema } from 'zod';

/**
 * An Action represents a unit of work that can be executed by an AI agent.
 *
 * Actions are:
 * - Idempotent (safe to retry)
 * - Rollback-aware (can undo if something goes wrong)
 * - Schema-validated (inputs/outputs are type-safe)
 * - Auditable (every execution is logged)
 */
export interface Action<TInput = unknown, TOutput = unknown> {
  /** Unique name for this action (e.g., "send_email") */
  name: string;

  /** Human-readable description */
  description?: string;

  /** Zod schema for input validation */
  inputs: ZodSchema<TInput>;

  /** Zod schema for output validation (optional) */
  outputs?: ZodSchema<TOutput>;

  /** Whether this action requires approval before execution */
  requiresApproval?: boolean;

  /** Execute the action with validated inputs */
  execute: (input: TInput) => Promise<TOutput>;

  /** Undo the action (optional, for rollback support) */
  undo?: (output: TOutput, input: TInput) => Promise<void>;
}

/**
 * Action execution result
 */
export interface ActionResult<TOutput = unknown> {
  /** Unique ID for this execution */
  id: string;

  /** Action name */
  action: string;

  /** Execution status */
  status: 'success' | 'failed';

  /** Output from the action (if successful) */
  output?: TOutput;

  /** Error message (if failed) */
  error?: string;

  /** Timestamp when execution started */
  startedAt: Date;

  /** Timestamp when execution completed */
  completedAt: Date;

  /** Number of retry attempts */
  retryCount: number;
}

/**
 * Execution context passed to actions
 */
export interface ActionContext {
  /** Unique workflow ID this action belongs to */
  workflowId: string;

  /** Unique action execution ID */
  executionId: string;

  /** Agent that triggered this action */
  triggeredBy?: string;

  /** User who approved this action (if approvalprotocol was used) */
  approvedBy?: string;
}
