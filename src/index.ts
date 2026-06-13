/**
 * Body — Durable action execution for AI agents
 *
 * @packageDocumentation
 */

// Core action types and utilities
export { Action, ActionResult, ActionContext } from './action/types';
export { defineAction } from './action/define';

// Example actions
export { httpRequest } from './action/examples/http-request';

// Workflow engine
export { WorkflowEngine } from './workflow/engine';
export { WorkflowDatabase } from './workflow/database';
export type {
  Workflow,
  WorkflowAction,
  WorkflowStatus,
  ActionStatus,
  AuditLogEntry,
  WorkflowConfig,
} from './workflow/types';

// Version
export const VERSION = '0.1.0';
